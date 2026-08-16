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
});
