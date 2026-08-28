/**
 * Fix Pending §19 (redesigned 2026-08-29, migration 22) — the ONE scenario that can only ever occur on a
 * real, already-running on-disk DB that used the pre-redesign SUPERSEDED+insert mechanism: a genuine
 * status='SUPERSEDED' row with a superseded_by_movement_id pointer, written by the OLD editPending()
 * before this migration ever ran. Migration 22 must backfill this predecessor's content into
 * fix_pending_audit BEFORE excluding it from the rebuilt balance_movements (its own narrower CHECK no
 * longer allows SUPERSEDED at all) — this test is what proves the backfill actually runs and produces
 * the right content, not just that the rebuild itself doesn't throw.
 *
 * Runs migrations 1-20 first (bringing an empty legacy-fixture DB up to the pre-redesign Fix Pending
 * shape), THEN inserts the SUPERSEDED/successor pair directly via `PRAGMA ignore_check_constraints=1`
 * (a real on-disk DB reached this state via actual OLD-mechanism app usage against ITS OWN,
 * historically-wider CHECK constraint — this test's own `balance_movements` table has ALREADY been
 * rebuilt by migrations 13/15/17 using the CURRENT, already-narrowed MOVEMENT_STATUS_VALUES by this
 * point, since those migrations' own CHECK lists are generated at replay time, not frozen at authoring
 * time — so a raw INSERT is the only way to reproduce the historical state within one continuous replay),
 * THEN runs the remaining migrations (21/22) and asserts the backfill + exclusion.
 */
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../../../src/db/migrations';
import { createLegacyBalanceContractsTable, createLegacyBalanceMovementsTable } from '../helpers/legacyDbFixture';

function insertLegacyContract(db: DatabaseSync, id: string): void {
  db.exec(`
    INSERT INTO balance_contracts (
      balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number,
      status, currency, opening_balance, effective_from, created_by, created_at
    ) VALUES (
      '${id}', 'lc-${id}', 1, 'IPLC_LC', 'LC-${id}', 'ACTIVE', 'USD', '0', '2026-01-01T00:00:00Z', 'maker1', '2026-01-01T00:00:00Z'
    )
  `);
}

/** Inserts directly, bypassing the CHECK constraint — see this file's own top comment for why. */
function insertPastCheckConstraint(db: DatabaseSync, row: Record<string, unknown>): void {
  db.exec('PRAGMA ignore_check_constraints = 1');
  try {
    const cols = Object.keys(row);
    db.prepare(`INSERT INTO balance_movements (${cols.join(', ')}) VALUES (${cols.map((c) => `@${c}`).join(', ')})`).run(row as never);
  } finally {
    db.exec('PRAGMA ignore_check_constraints = 0');
  }
}

describe('migration 22 (Fix Pending SUPERSEDED backfill + balance_movements rebuild)', () => {
  test('a pre-existing SUPERSEDED predecessor is backfilled into fix_pending_audit and excluded from the rebuilt table; its live successor is untouched', () => {
    const db = new DatabaseSync(':memory:');
    try {
      createLegacyBalanceContractsTable(db);
      createLegacyBalanceMovementsTable(db);
      insertLegacyContract(db, 'c1');

      // Migrations 1-20: brings the table up through the pre-redesign Fix Pending shape (adds
      // superseded_by_movement_id/edited_by/edited_at as nullable columns, migration 19).
      for (const m of MIGRATIONS.filter((m) => m.id <= 20)) m.up(db);

      // Simulate the OLD editPending() mechanism's own historical write — a real on-disk DB reaches this
      // exact state via actual app usage (markSuperseded() + insert()), not a raw SQL statement.
      insertPastCheckConstraint(db, {
        movement_id: 'm-old',
        balance_contract_id: 'c1',
        event_seq: 1,
        business_event_id: null,
        movement_type: 'ISSUE',
        exposure_nature: 'CONTINGENT',
        amount: '100000',
        ceiling_amount: '100000',
        currency: 'USD',
        status: 'SUPERSEDED',
        superseded_by_movement_id: 'm-new',
        created_by: 'maker1',
        created_at: '2026-01-01T00:00:00Z',
        edited_by: 'maker2',
        edited_at: '2026-01-02T00:00:00Z',
      });
      insertPastCheckConstraint(db, {
        movement_id: 'm-new',
        balance_contract_id: 'c1',
        event_seq: 1, // §19 — the replacement reuses the SAME eventSeq under the pre-redesign mechanism
        business_event_id: null,
        movement_type: 'ISSUE',
        exposure_nature: 'CONTINGENT',
        amount: '120000',
        ceiling_amount: '120000',
        currency: 'USD',
        status: 'PENDING',
        superseded_movement_id: 'm-old',
        created_by: 'maker2',
        created_at: '2026-01-02T00:00:00Z',
      });

      // Migrations 21-22: creates fix_pending_audit, backfills it, rebuilds balance_movements.
      for (const m of MIGRATIONS.filter((m) => m.id > 20)) m.up(db);

      const movements = db.prepare('SELECT movement_id, status, amount FROM balance_movements ORDER BY movement_id').all() as { movement_id: string; status: string; amount: string }[];
      expect(movements).toEqual([{ movement_id: 'm-new', status: 'PENDING', amount: '120000' }]); // m-old excluded, m-new untouched

      const audit = db.prepare('SELECT * FROM fix_pending_audit').all() as Record<string, unknown>[];
      expect(audit).toHaveLength(1);
      expect(audit[0]!.movement_id).toBe('m-old');
      expect(audit[0]!.balance_contract_id).toBe('c1');
      expect(audit[0]!.event_seq).toBe(1);
      expect(audit[0]!.original_created_by).toBe('maker1');
      expect(audit[0]!.status_before).toBe('PENDING');
      expect(audit[0]!.edited_by).toBe('maker2');
      expect(audit[0]!.edited_at).toBe('2026-01-02T00:00:00Z');
      const before = JSON.parse(audit[0]!.before_snapshot as string);
      expect(before.amount).toBe('100000');
      const after = JSON.parse(audit[0]!.after_snapshot as string);
      expect(after.amount).toBe('120000');

      // The narrowed CHECK constraint actually took effect — SUPERSEDED is no longer a legal value.
      expect(() => db.prepare(`UPDATE balance_movements SET status = 'SUPERSEDED' WHERE movement_id = 'm-new'`).run()).toThrow(/CHECK constraint failed/);
    } finally {
      db.close();
    }
  });

  test('a SUPERSEDED predecessor whose successor cannot be found still backfills a best-effort audit row rather than throwing', () => {
    const db = new DatabaseSync(':memory:');
    try {
      createLegacyBalanceContractsTable(db);
      createLegacyBalanceMovementsTable(db);
      insertLegacyContract(db, 'c1');

      for (const m of MIGRATIONS.filter((m) => m.id <= 20)) m.up(db);

      // An orphaned SUPERSEDED row with no discoverable successor — superseded_by_movement_id never set.
      insertPastCheckConstraint(db, {
        movement_id: 'm-orphan',
        balance_contract_id: 'c1',
        event_seq: 5,
        business_event_id: null,
        movement_type: 'ISSUE',
        exposure_nature: 'CONTINGENT',
        amount: '5000',
        ceiling_amount: '5000',
        currency: 'USD',
        status: 'SUPERSEDED',
        created_by: 'maker1',
        created_at: '2026-01-01T00:00:00Z',
      });

      expect(() => {
        for (const m of MIGRATIONS.filter((m) => m.id > 20)) m.up(db);
      }).not.toThrow();

      const audit = db.prepare('SELECT * FROM fix_pending_audit').all() as Record<string, unknown>[];
      expect(audit).toHaveLength(1);
      expect(audit[0]!.movement_id).toBe('m-orphan');
      expect(audit[0]!.edited_by).toBe('unknown'); // no edited_by was ever recorded — best-effort fallback
      expect(JSON.parse(audit[0]!.after_snapshot as string)).toEqual({}); // no successor found

      const movements = db.prepare('SELECT movement_id FROM balance_movements').all();
      expect(movements).toHaveLength(0); // the orphan itself is still excluded from the rebuilt table
    } finally {
      db.close();
    }
  });
});
