/**
 * Direct unit tests for the migration runner (Quality-report-balance.md BAL-106) — separate from
 * db/index.test.ts's own createDb()-level coverage, which only exercises runMigrations() indirectly.
 * These construct a bare DatabaseSync + the real table shapes directly (not via createDb(), so the
 * schema_migrations tracking table genuinely doesn't exist yet at the start of each test), via the shared
 * legacyDbFixture helper (test/unit/helpers/legacyDbFixture.ts) — every migration up through 13 (the
 * balance_contracts/balance_movements CHECK/FK rebuild) needs the FULL real column set to exist, not just
 * whichever columns an earlier, smaller migration happened to need.
 */
import { DatabaseSync } from 'node:sqlite';
import { runMigrations, MIGRATIONS } from '../../../src/db/migrations';
import { createLegacyBalanceContractsTable, createLegacyBalanceMovementsTable } from '../helpers/legacyDbFixture';

function bareDbWithBalanceMovementsTable(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  createLegacyBalanceMovementsTable(db);
  createLegacyBalanceContractsTable(db);
  return db;
}

describe('runMigrations (src/db/migrations.ts)', () => {
  test('migration 26 preserves maintained mappings and permits a future configured SL value', () => {
    const db = bareDbWithBalanceMovementsTable();
    try {
      for (const migration of MIGRATIONS.filter((item) => item.id <= 23)) migration.up(db);
      db.prepare(`INSERT INTO balance_account_mappings (
        mapping_key, instrument_type, risk_class, account_a_number, account_a_description,
        account_b_number, account_b_description, version, updated_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'IPLC_LC:SIGHT', 'IPLC_LC', 'SIGHT', 'A-100', 'A description', 'B-100', 'B description', 7, 'ops-user', '2026-09-04T00:00:00.000Z',
      );

      MIGRATIONS.find((item) => item.id === 26)!.up(db);

      expect(db.prepare('SELECT * FROM balance_account_mappings WHERE mapping_key = ?').get('IPLC_LC:SIGHT')).toMatchObject({
        account_a_number: 'A-100',
        account_b_number: 'B-100',
        version: 7,
        updated_by: 'ops-user',
      });
      expect(() => db.prepare(`INSERT INTO balance_account_mappings (
        mapping_key, instrument_type, risk_class, account_a_number, account_a_description,
        account_b_number, account_b_description, version, updated_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'FUTURE_BUSINESS:FUTURE_CONFIGURED_TENOR', 'FUTURE_BUSINESS', 'FUTURE_CONFIGURED_TENOR', 'A-200', 'A future', 'B-200', 'B future', 1, 'ops-user', '2026-09-04T00:00:00.000Z',
      )).not.toThrow();
    } finally {
      db.close();
    }
  });

  test('creates the schema_migrations tracking table and records migration 1 as applied on a fresh run', () => {
    const db = bareDbWithBalanceMovementsTable();
    try {
      runMigrations(db);
      const rows = db.prepare('SELECT id FROM schema_migrations ORDER BY id').all() as { id: number }[];
      expect(rows.map((r) => r.id)).toEqual(MIGRATIONS.map((m) => m.id));

      const columns = (db.prepare('PRAGMA table_info(balance_movements)').all() as { name: string }[]).map((c) => c.name);
      expect(columns).toEqual(
        expect.arrayContaining([
          'acknowledged_by',
          'acknowledged_at',
          'maker_submitted_by',
          'maker_submitted_at',
          'event_snapshot',
          'root_event_snapshot',
          'acceptance_event_snapshot',
          'sg_event_snapshot',
          'finalize_event_snapshot',
          'finalize_acceptance_event_snapshot',
          'finalize_sg_event_snapshot',
          'present_docs_consumed_at',
          'present_docs_consumed_by',
        ]),
      );

      // Migration 13 (2026-08-21, CHECK/FK rebuild) actually applied — spot-check one CHECK and one FK.
      const movementColumns = db.prepare('PRAGMA table_info(balance_movements)').all() as { name: string }[];
      expect(movementColumns.map((c) => c.name)).toContain('movement_type');
      expect(() => db.exec(`INSERT INTO balance_contracts (balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number, status, currency, opening_balance, effective_from, created_by, created_at) VALUES ('x','x',1,'NOT_A_REAL_TYPE','LC1','ACTIVE','USD','0','2026-01-01T00:00:00Z','maker1','2026-01-01T00:00:00Z')`)).toThrow();
    } finally {
      db.close();
    }
  });

  test('a second run against the same db is a no-op — does not re-attempt the (now-failing, column-already-exists / table-already-rebuilt) migrations', () => {
    const db = bareDbWithBalanceMovementsTable();
    try {
      runMigrations(db);
      // If runMigrations() failed to skip an already-applied migration, this second call would throw
      // ("duplicate column name" for 1-11, "table balance_contracts_new already exists" for 13, etc.).
      expect(() => runMigrations(db)).not.toThrow();
      const rows = db.prepare('SELECT id FROM schema_migrations').all() as { id: number }[];
      expect(rows).toHaveLength(MIGRATIONS.length);
    } finally {
      db.close();
    }
  });

  // analysis/Balance-Component-DB-Optimization-Analysis.md P1 (2026-08-21) — migration 13's own
  // BEGIN/COMMIT/ROLLBACK wrapping exists specifically so a genuine pre-existing bad value (a real
  // production DB with dirty data, not the clean live dev DB this migration was verified against) fails
  // the whole rebuild atomically instead of leaving balance_contracts half-migrated. Proves both halves:
  // the throw itself, AND that the table is byte-for-byte unchanged afterward — a rollback that "mostly"
  // works but leaves a stray _new table or a dropped-not-restored original would still show corruption
  // here even though runMigrations() itself did throw.
  test('migration 13 rolls back cleanly when a pre-existing row violates the new CHECK constraint, leaving balance_contracts exactly as it was before', () => {
    const db = bareDbWithBalanceMovementsTable();
    try {
      db.exec(`
        INSERT INTO balance_contracts (
          balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number,
          status, currency, opening_balance, effective_from, created_by, created_at
        ) VALUES (
          'dirty-1', 'lc-dirty-1', 1, 'NOT_A_REAL_INSTRUMENT_TYPE', 'LC-DIRTY-001',
          'ACTIVE', 'USD', '0', '2020-01-01T00:00:00Z', 'legacy-import', '2020-01-01T00:00:00Z'
        )
      `);

      expect(() => runMigrations(db)).toThrow();

      // Migrations 1-12 each commit independently as they succeed (outside migration 13's own
      // transaction) — only 13 itself should be missing/rolled back.
      const appliedIds = (db.prepare('SELECT id FROM schema_migrations ORDER BY id').all() as { id: number }[]).map((r) => r.id);
      expect(appliedIds).toEqual(MIGRATIONS.filter((m) => m.id <= 12).map((m) => m.id));

      // The dirty row (and the table itself) must still be exactly as it was pre-rollback — no CHECK
      // constraint present (rollback undid the rebuild), original row untouched.
      const row = db.prepare('SELECT * FROM balance_contracts WHERE balance_contract_id = ?').get('dirty-1') as { instrument_type: string } | undefined;
      expect(row?.instrument_type).toBe('NOT_A_REAL_INSTRUMENT_TYPE');
      // No leftover half-built table from the aborted rebuild.
      const tableNames = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]).map((r) => r.name);
      expect(tableNames).not.toContain('balance_contracts_new');
      expect(tableNames).not.toContain('balance_movements_new');

      // A later re-run (once the dirty row is fixed/removed) picks migration 13 back up rather than
      // silently skipping it forever.
      db.exec(`DELETE FROM balance_contracts WHERE balance_contract_id = 'dirty-1'`);
      expect(() => runMigrations(db)).not.toThrow();
      const finalIds = (db.prepare('SELECT id FROM schema_migrations ORDER BY id').all() as { id: number }[]).map((r) => r.id);
      expect(finalIds).toEqual(MIGRATIONS.map((m) => m.id));
    } finally {
      db.close();
    }
  });

  // Same rigor as migration 13's own rollback test above, for migration 15's own rebuild (2026-08-25, F1
  // external BA review — widens the status/movement_type CHECK lists) — a genuine pre-existing bad value
  // must fail this rebuild atomically too, not just migration 13's.
  test('migration 15 rolls back cleanly when a pre-existing row violates the rebuilt CHECK constraint, leaving balance_movements exactly as it was before', () => {
    const db = bareDbWithBalanceMovementsTable();
    try {
      for (const m of MIGRATIONS.filter((m) => m.id <= 14)) m.up(db);

      db.exec(`
        INSERT INTO balance_contracts (
          balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number,
          status, currency, opening_balance, effective_from, created_by, created_at
        ) VALUES (
          'c1', 'lc1', 1, 'IPLC_LC', 'LC0001', 'ACTIVE', 'USD', '0', '2026-01-01T00:00:00Z', 'maker1', '2026-01-01T00:00:00Z'
        )
      `);
      db.exec('PRAGMA ignore_check_constraints = 1');
      db.exec(`
        INSERT INTO balance_movements (
          movement_id, balance_contract_id, event_seq, movement_type, exposure_nature, amount,
          ceiling_amount, currency, status, created_by, created_at
        ) VALUES (
          'dirty-1', 'c1', 1, 'NOT_A_REAL_MOVEMENT_TYPE', 'CONTINGENT', '1000', '1000', 'USD',
          'PENDING', 'legacy-import', '2020-01-01T00:00:00Z'
        )
      `);
      db.exec('PRAGMA ignore_check_constraints = 0');

      expect(() => {
        for (const m of MIGRATIONS.filter((m) => m.id === 15)) m.up(db);
      }).toThrow();

      const row = db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get('dirty-1') as { movement_type: string } | undefined;
      expect(row?.movement_type).toBe('NOT_A_REAL_MOVEMENT_TYPE');
      const tableNames = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]).map((r) => r.name);
      expect(tableNames).not.toContain('balance_movements_new');
      expect(tableNames).not.toContain('balance_contracts_new');
    } finally {
      db.close();
    }
  });

  // Same rigor as migration 13's own rollback test above, for migration 22's balance_movements rebuild
  // (2026-08-29, Fix Pending §19 redesign) — a genuine pre-existing bad value (bypassing the CURRENT
  // CHECK the same way a real historical DB could, via PRAGMA ignore_check_constraints) must fail the
  // whole rebuild atomically, not leave the table half-migrated.
  test('migration 22 rolls back cleanly when a pre-existing row violates the rebuilt CHECK constraint, leaving balance_movements exactly as it was before', () => {
    const db = bareDbWithBalanceMovementsTable();
    try {
      for (const m of MIGRATIONS.filter((m) => m.id <= 20)) m.up(db);

      db.exec(`
        INSERT INTO balance_contracts (
          balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number,
          status, currency, opening_balance, effective_from, created_by, created_at
        ) VALUES (
          'c1', 'lc1', 1, 'IPLC_LC', 'LC0001', 'ACTIVE', 'USD', '0', '2026-01-01T00:00:00Z', 'maker1', '2026-01-01T00:00:00Z'
        )
      `);
      db.exec('PRAGMA ignore_check_constraints = 1');
      db.exec(`
        INSERT INTO balance_movements (
          movement_id, balance_contract_id, event_seq, movement_type, exposure_nature, amount,
          ceiling_amount, currency, status, created_by, created_at
        ) VALUES (
          'dirty-1', 'c1', 1, 'NOT_A_REAL_MOVEMENT_TYPE', 'CONTINGENT', '1000', '1000', 'USD',
          'PENDING', 'legacy-import', '2020-01-01T00:00:00Z'
        )
      `);
      db.exec('PRAGMA ignore_check_constraints = 0');

      expect(() => {
        for (const m of MIGRATIONS.filter((m) => m.id > 20)) m.up(db);
      }).toThrow();

      // migration 21 (fix_pending_audit table) still committed independently — only 22 itself rolled back.
      const row = db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get('dirty-1') as { movement_type: string } | undefined;
      expect(row?.movement_type).toBe('NOT_A_REAL_MOVEMENT_TYPE');
      const tableNames = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]).map((r) => r.name);
      expect(tableNames).not.toContain('balance_movements_new');
      expect(db.prepare('SELECT COUNT(*) AS n FROM fix_pending_audit').get()).toEqual({ n: 0 });
    } finally {
      db.close();
    }
  });

  // Each of these ALTER-COLUMN-if-missing migrations' own "column already exists, skip" branch is
  // structurally unreachable via runMigrations() itself (schema_migrations tracks by id, so a migration's
  // own up() only ever runs once per db) — same shape as the pre-existing migration-1 backward-
  // compatibility test above, generalized to every remaining single-column-add migration by calling up()
  // directly a second time, bypassing the id-based dedup.
  test('every remaining ALTER-COLUMN-if-missing migration correctly no-ops when its own column(s) already exist', () => {
    const db = bareDbWithBalanceMovementsTable();
    try {
      for (const m of MIGRATIONS.filter((m) => m.id <= 13)) m.up(db);
      const rerunnable = MIGRATIONS.filter((m) => [14, 16, 17, 19].includes(m.id));
      for (const m of rerunnable) m.up(db);
      expect(() => {
        for (const m of rerunnable) m.up(db);
      }).not.toThrow();
    } finally {
      db.close();
    }
  });

  test('backward compatibility: a db that already has acknowledged_by/acknowledged_at (e.g. from the old hand-rolled migrate(), before schema_migrations existed) is recorded as migrated without erroring', () => {
    const db = new DatabaseSync(':memory:');
    try {
      // Day-one fixture (see legacyDbFixture.ts's own doc comment) PLUS the 2 columns migration 1 itself
      // adds — simulates a DB that already went through the OLD hand-rolled migrate() for migration 1
      // specifically, before this migration-runner even existed, but never got any of 2-11's own columns
      // (those still need to be added fresh here) or a schema_migrations table.
      createLegacyBalanceMovementsTable(db);
      db.exec('ALTER TABLE balance_movements ADD COLUMN acknowledged_by TEXT');
      db.exec('ALTER TABLE balance_movements ADD COLUMN acknowledged_at TEXT');
      createLegacyBalanceContractsTable(db);
      expect(() => runMigrations(db)).not.toThrow();
      const rows = db.prepare('SELECT id FROM schema_migrations').all() as { id: number }[];
      expect(rows.map((r) => r.id)).toEqual(MIGRATIONS.map((m) => m.id));
    } finally {
      db.close();
    }
  });
});
