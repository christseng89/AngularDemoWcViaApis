/**
 * analysis/Balance-Component-DB-Optimization-Analysis.md P1 (2026-08-21, migration 13) — the "行為等價"
 * rigor established for the earlier A+B pass doesn't translate literally to a schema migration (there is
 * no "old query result vs new query result" to diff — migration 13 ADDS a constraint that never existed,
 * it doesn't rewrite a query). The equivalent bar here is: every row that existed before the rebuild must
 * come out the other side with byte-for-byte identical column values (this file), AND the new constraints
 * must actually reject what they're supposed to while accepting every legitimate value
 * (checkAndForeignKeyConstraints.test.ts, same directory).
 *
 * Deliberately includes self-referencing rows in the SAME batch being copied (a movement whose
 * superseded_movement_id points at a sibling row also being copied in this same rebuild) — migration 13's
 * own PRAGMA foreign_keys = OFF for the whole rebuild exists specifically so SQLite's per-row (not
 * end-of-statement) FK checking can't fail on insertion order inside one multi-row INSERT ... SELECT; this
 * test is what proves that actually works, not just that it compiles.
 */
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/db/migrations';
import { createLegacyBalanceContractsTable, createLegacyBalanceMovementsTable } from '../helpers/legacyDbFixture';

describe('migration 13 (CHECK/FK rebuild) preserves every pre-existing row exactly', () => {
  test('balance_contracts: every column value, across every InstrumentType/ContractStatus/tenor_type (incl. NULL) represented, is identical before and after', () => {
    const db = new DatabaseSync(':memory:');
    try {
      createLegacyBalanceContractsTable(db);
      createLegacyBalanceMovementsTable(db);

      const rows = [
        {
          balance_contract_id: 'c1',
          logical_contract_id: 'lc1',
          contract_version: 1,
          instrument_type: 'IPLC_LC',
          lc_number: 'LC0001',
          ib_number: null,
          sg_number: null,
          leg_seq: null,
          parent_logical_contract_id: null,
          status: 'ACTIVE',
          supersedes_balance_contract_id: null,
          superseded_by_balance_contract_id: null,
          currency: 'USD',
          tolerance_pct: '10',
          tenor_type: 'SIGHT',
          tenor_days: 0,
          maturity_date: null,
          opening_balance: '0',
          source_amendment_no: null,
          effective_from: '2026-01-01T00:00:00Z',
          effective_to: null,
          created_by: 'maker1',
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          balance_contract_id: 'c2',
          logical_contract_id: 'lc2',
          contract_version: 1,
          instrument_type: 'SHGT',
          lc_number: 'LC0001',
          ib_number: null,
          sg_number: 'SG01',
          leg_seq: null,
          parent_logical_contract_id: 'lc1',
          status: 'CLOSED',
          supersedes_balance_contract_id: null,
          superseded_by_balance_contract_id: null,
          currency: 'USD',
          tolerance_pct: null,
          tenor_type: null, // SHGT genuinely has no tenor — proves the nullable CHECK survives the rebuild.
          tenor_days: null,
          maturity_date: null,
          opening_balance: '5000',
          source_amendment_no: null,
          effective_from: '2026-01-02T00:00:00Z',
          effective_to: '2026-01-05T00:00:00Z',
          created_by: 'maker1',
          created_at: '2026-01-02T00:00:00Z',
        },
        {
          balance_contract_id: 'c3',
          logical_contract_id: 'lc1',
          contract_version: 2,
          instrument_type: 'IPLC_LC',
          lc_number: 'LC0001',
          ib_number: 'IB01',
          sg_number: null,
          leg_seq: 'A',
          parent_logical_contract_id: null,
          status: 'SUPERSEDED',
          // Self-reference to a sibling row inserted in the SAME batch — the exact case
          // PRAGMA foreign_keys = OFF during the rebuild is meant to protect.
          supersedes_balance_contract_id: 'c1',
          superseded_by_balance_contract_id: null,
          currency: 'EUR',
          tolerance_pct: '5',
          tenor_type: 'BUYERS_USANCE',
          tenor_days: 90,
          maturity_date: '2026-04-01T00:00:00Z',
          opening_balance: '20000',
          source_amendment_no: 1,
          effective_from: '2026-01-03T00:00:00Z',
          effective_to: null,
          created_by: 'maker2',
          created_at: '2026-01-03T00:00:00Z',
        },
      ];

      const cols = Object.keys(rows[0]!);
      const placeholders = cols.map((c) => `@${c}`).join(', ');
      const insertStmt = db.prepare(`INSERT INTO balance_contracts (${cols.join(', ')}) VALUES (${placeholders})`);
      for (const row of rows) insertStmt.run(row as Record<string, unknown> as never);

      const before = db.prepare('SELECT * FROM balance_contracts ORDER BY balance_contract_id').all();
      expect(before).toHaveLength(3);

      runMigrations(db);

      const after = db.prepare('SELECT * FROM balance_contracts ORDER BY balance_contract_id').all();
      expect(after).toHaveLength(3);
      expect(after).toEqual(before);
    } finally {
      db.close();
    }
  });

  test('balance_movements: every column value, across every MovementType/MovementStatus/ExposureNature represented, plus self-referencing FK columns, is identical before and after', () => {
    const db = new DatabaseSync(':memory:');
    try {
      createLegacyBalanceContractsTable(db);
      createLegacyBalanceMovementsTable(db);
      db.exec(`
        INSERT INTO balance_contracts (
          balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number,
          status, currency, opening_balance, effective_from, created_by, created_at
        ) VALUES (
          'c1', 'lc1', 1, 'IPLC_LC', 'LC0001', 'ACTIVE', 'USD', '0', '2026-01-01T00:00:00Z', 'maker1', '2026-01-01T00:00:00Z'
        )
      `);

      const rows = [
        {
          movement_id: 'm1',
          balance_contract_id: 'c1',
          event_seq: 1,
          business_event_id: null,
          movement_type: 'ISSUE',
          exposure_nature: 'CONTINGENT',
          amount: '10000',
          ceiling_amount: '11000',
          currency: 'USD',
          leg_ref: null,
          account_entries: null,
          lmts_reservation_id: null,
          status: 'RELEASED',
          superseded_movement_id: null,
          reversal_of_movement_id: null,
          reason_code: null,
          remarks: null,
          transaction_date: null,
          business_date: null,
          value_date: null,
          source_module: null,
          source_function: null,
          source_transaction_ref: null,
          balance_before: '0',
          balance_after: '10000',
          warnings: null,
          created_by: 'maker1',
          released_by: 'checker1',
          created_at: '2026-01-01T00:00:00Z',
          released_at: '2026-01-01T01:00:00Z',
        },
        {
          movement_id: 'm2',
          balance_contract_id: 'c1',
          event_seq: 2,
          business_event_id: 'be-1',
          movement_type: 'AMEND_DECREASE',
          exposure_nature: 'ACTUAL',
          amount: '1000',
          ceiling_amount: '10000',
          currency: 'USD',
          leg_ref: 'leg-1',
          account_entries: '[{"drAccount":"X","crAccount":"Y","currency":"USD","amount":"1000"}]',
          lmts_reservation_id: 'lmts-1',
          status: 'PENDING',
          // Self-reference to a sibling row also being copied in this same rebuild batch.
          superseded_movement_id: 'm1',
          reversal_of_movement_id: null,
          reason_code: 'RC01',
          remarks: 'test remark',
          transaction_date: '2026-01-02',
          business_date: '2026-01-02',
          value_date: '2026-01-02',
          source_module: 'MOD',
          source_function: 'FUNC',
          source_transaction_ref: 'REF-1',
          balance_before: '10000',
          balance_after: '9000',
          warnings: '[{"code":"W1","message":"warn"}]',
          created_by: 'maker2',
          released_by: null,
          created_at: '2026-01-02T00:00:00Z',
          released_at: null,
        },
        {
          movement_id: 'm3',
          balance_contract_id: 'c1',
          event_seq: 3,
          business_event_id: null,
          movement_type: 'CLOSE',
          exposure_nature: 'MEMO',
          amount: '0',
          ceiling_amount: '0',
          currency: 'USD',
          leg_ref: null,
          account_entries: null,
          lmts_reservation_id: null,
          status: 'CANCELLED',
          superseded_movement_id: null,
          // Self-reference to a sibling row also being copied in this same rebuild batch.
          reversal_of_movement_id: 'm2',
          reason_code: null,
          remarks: null,
          transaction_date: null,
          business_date: null,
          value_date: null,
          source_module: null,
          source_function: null,
          source_transaction_ref: null,
          balance_before: null,
          balance_after: null,
          warnings: null,
          created_by: 'maker1',
          released_by: null,
          created_at: '2026-01-03T00:00:00Z',
          released_at: null,
        },
      ];

      const cols = Object.keys(rows[0]!);
      const placeholders = cols.map((c) => `@${c}`).join(', ');
      const insertStmt = db.prepare(`INSERT INTO balance_movements (${cols.join(', ')}) VALUES (${placeholders})`);
      for (const row of rows) insertStmt.run(row as Record<string, unknown> as never);

      const before = db.prepare('SELECT * FROM balance_movements ORDER BY movement_id').all();
      expect(before).toHaveLength(3);

      runMigrations(db);

      // The 17 migration-1-11-added columns are now present too (NULL for every pre-existing row, since
      // none of them ever wrote to those columns) — compare only the day-one column set for equality,
      // and separately assert the new columns exist and are NULL.
      const after = db.prepare('SELECT * FROM balance_movements ORDER BY movement_id').all() as Record<string, unknown>[];
      expect(after).toHaveLength(3);
      const dayOneCols = cols;
      const afterProjected = after.map((row) => Object.fromEntries(dayOneCols.map((c) => [c, row[c]])));
      expect(afterProjected).toEqual(before);

      for (const row of after) {
        expect(row.acknowledged_by).toBeNull();
        expect(row.event_snapshot).toBeNull();
      }
    } finally {
      db.close();
    }
  });
});
