/**
 * createDb()'s own file-vs-':memory:' branching (src/db/index.ts) — every
 * other test in this project passes ':memory:' (see schema.test.ts,
 * app.test.ts, caseWalkthroughs.test.ts), which never exercises the
 * `PRAGMA journal_mode = WAL` branch that only runs for a real on-disk file.
 * This is a real production code path (any deployment outside the test
 * suite uses a real file), so it deserves its own direct coverage rather
 * than staying permanently untested.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createDb } from '../../../src/db';
import { BalanceContractStore } from '../../../src/store/balanceContractStore';

describe('createDb — real file path (src/db/index.ts)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'balance-component-db-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("a real file path takes the WAL branch (filePath !== ':memory:') and produces a usable, on-disk database", () => {
    const filePath = join(dir, 'balance-component-test.sqlite');
    const db = createDb(filePath);
    try {
      expect(existsSync(filePath)).toBe(true);

      // PRAGMA journal_mode = WAL was actually applied (as opposed to the
      // default 'delete' mode ':memory:' databases always report).
      const row = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
      expect(row.journal_mode.toLowerCase()).toBe('wal');

      // Schema + migration still ran correctly for a fresh on-disk file — the
      // store layer works exactly the same as it does against ':memory:'.
      const contracts = new BalanceContractStore(db);
      contracts.insert({
        balanceContractId: 'bc-file-1',
        logicalContractId: 'lc-file-1',
        contractVersion: 1,
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'FILE-001' },
        status: 'ACTIVE',
        currency: 'USD',
        tolerancePct: null,
        openingBalance: '0',
        effectiveFrom: '2026-08-16T00:00:00Z',
        createdBy: 'maker1',
        createdAt: '2026-08-16T00:00:00Z',
      });
      expect(contracts.findById('bc-file-1')?.naturalKey.lcNumber).toBe('FILE-001');
    } finally {
      db.close();
    }
  });

  test(':memory:  still takes the non-WAL branch (default journal mode, not WAL) — the two branches genuinely differ, not just in which line runs', () => {
    const db = createDb(':memory:');
    try {
      const row = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
      expect(row.journal_mode.toLowerCase()).not.toBe('wal');
    } finally {
      db.close();
    }
  });

  // analysis/Balance-Component-DB-Optimization-Analysis.md P0 — without this PRAGMA, a second writer
  // that can't get the lock throws SQLITE_BUSY immediately instead of queueing, which is not the
  // same-LC serialization Design doc §6 requires. Applies to both branches (unconditional in createDb()),
  // unlike WAL which is file-only.
  test('busy_timeout is set on both a real file and :memory: — unconditional, unlike the WAL branch', () => {
    const fileDb = createDb(join(dir, 'balance-component-busy-timeout.sqlite'));
    const memDb = createDb(':memory:');
    try {
      expect((fileDb.prepare('PRAGMA busy_timeout').get() as { timeout: number }).timeout).toBe(5000);
      expect((memDb.prepare('PRAGMA busy_timeout').get() as { timeout: number }).timeout).toBe(5000);
    } finally {
      fileDb.close();
      memDb.close();
    }
  });

  test('re-opening the SAME real file a second time hits the migrate() no-op path (columns already present from the first createDb() call) without error', () => {
    const filePath = join(dir, 'balance-component-reopen.sqlite');
    const db1 = createDb(filePath);
    db1.close();

    const db2 = createDb(filePath);
    try {
      const columns = (db2.prepare('PRAGMA table_info(balance_movements)').all() as { name: string }[]).map((c) => c.name);
      expect(columns).toEqual(expect.arrayContaining(['acknowledged_by', 'acknowledged_at', 'maker_submitted_by', 'maker_submitted_at']));
    } finally {
      db2.close();
    }
  });

  // analysis/Balance-Component-DB-Optimization-Analysis.md P2 (2026-08-21) — migration 12's own exact
  // reason for existing: a real on-disk DB file created BEFORE this fix already has idx_contracts_parent
  // under its old single-column definition, and CREATE INDEX IF NOT EXISTS in schema.ts alone would never
  // upgrade it (SQLite's IF NOT EXISTS only checks the index NAME, not its column list) — only
  // migrations.ts's own explicit DROP+CREATE actually fixes an already-existing file.
  test('a pre-existing on-disk DB with the OLD single-column idx_contracts_parent is upgraded to the composite (parent_logical_contract_id, instrument_type) definition on re-open', () => {
    const filePath = join(dir, 'balance-component-index-upgrade.sqlite');

    // Simulate a file created by a pre-fix version of this app: the FULL balance_contracts column set
    // (createDb() itself runs schema.ts's own CREATE TABLE IF NOT EXISTS afterward, which no-ops once
    // the table already exists by name — so every column its own CREATE INDEX statements reference must
    // already be present here, or those statements fail with "no such column") but with the OLD
    // single-column idx_contracts_parent, no schema_migrations table (so migrations 1-11 also apply
    // fresh here, same as any genuinely pre-fix file).
    const preFixDb = new DatabaseSync(filePath);
    preFixDb.exec(`
      CREATE TABLE balance_contracts (
        balance_contract_id TEXT PRIMARY KEY,
        logical_contract_id TEXT NOT NULL,
        contract_version INTEGER NOT NULL,
        instrument_type TEXT NOT NULL,
        lc_number TEXT NOT NULL,
        ib_number TEXT,
        sg_number TEXT,
        leg_seq TEXT,
        parent_logical_contract_id TEXT,
        status TEXT NOT NULL,
        currency TEXT NOT NULL,
        opening_balance TEXT NOT NULL,
        effective_from TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_contracts_parent ON balance_contracts(parent_logical_contract_id);
      CREATE TABLE balance_movements (
        movement_id TEXT PRIMARY KEY,
        balance_contract_id TEXT NOT NULL,
        event_seq INTEGER NOT NULL,
        business_event_id TEXT,
        status TEXT NOT NULL
      );
    `);
    const oldIndexInfo = preFixDb.prepare('PRAGMA index_info(idx_contracts_parent)').all() as { name: string }[];
    expect(oldIndexInfo.map((c) => c.name)).toEqual(['parent_logical_contract_id']);
    preFixDb.close();

    const upgradedDb = createDb(filePath);
    try {
      const newIndexInfo = upgradedDb.prepare('PRAGMA index_info(idx_contracts_parent)').all() as { name: string }[];
      expect(newIndexInfo.map((c) => c.name)).toEqual(['parent_logical_contract_id', 'instrument_type']);
    } finally {
      upgradedDb.close();
    }
  });
});
