import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../../../src/db/migrations';
import { ExcessLedgerStore } from '../../../src/store/excessLedgerStore';

describe('migration 28 V4 cure removal', () => {
  test('preserves pre-V4 cure artifacts as read-only legacy audit while blocking new cure writes', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE excess_accounts (
          excess_account_id TEXT PRIMARY KEY,
          owner_type TEXT NOT NULL,
          owner_id TEXT NOT NULL,
          policy_version TEXT NOT NULL,
          version INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE excess_ledger_events (
          excess_event_id TEXT PRIMARY KEY,
          excess_account_id TEXT NOT NULL REFERENCES excess_accounts(excess_account_id),
          movement_id TEXT,
          event_type TEXT NOT NULL CHECK (event_type IN (
            'PENDING_RESERVATION','APPROVED_UTILIZATION','RESERVATION_RELEASE',
            'FORMAL_INCREASE_REGULARIZATION','RETURN_REVERSAL','CANCELLATION_REVERSAL'
          )),
          transaction_currency TEXT NOT NULL,
          transaction_amount TEXT NOT NULL,
          covered_amount TEXT NOT NULL,
          excess_amount TEXT NOT NULL,
          amount_usd TEXT NOT NULL,
          policy_version TEXT NOT NULL,
          source_excess_event_id TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE excess_allocations (
          excess_allocation_id TEXT PRIMARY KEY,
          adjustment_event_id TEXT NOT NULL REFERENCES excess_ledger_events(excess_event_id),
          approved_excess_event_id TEXT NOT NULL REFERENCES excess_ledger_events(excess_event_id),
          transaction_amount TEXT NOT NULL,
          amount_usd TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TRIGGER immutable_excess_allocations_update
          BEFORE UPDATE ON excess_allocations BEGIN SELECT RAISE(ABORT, 'excess_allocations is append-only'); END;
        CREATE TRIGGER immutable_excess_allocations_delete
          BEFORE DELETE ON excess_allocations BEGIN SELECT RAISE(ABORT, 'excess_allocations is append-only'); END;
        INSERT INTO excess_accounts VALUES ('ea-legacy','IMPORT_LC','lc-legacy','policy-legacy',1,'2026-09-01','2026-09-01');
        INSERT INTO excess_ledger_events VALUES
          ('approved-legacy','ea-legacy',NULL,'APPROVED_UTILIZATION','USD','25','0','25','25','policy-legacy',NULL,'checker','2026-09-01'),
          ('formal-legacy','ea-legacy',NULL,'FORMAL_INCREASE_REGULARIZATION','USD','5','0','5','5','policy-legacy','approved-legacy','maker','2026-09-02');
        INSERT INTO excess_allocations VALUES ('allocation-legacy','formal-legacy','approved-legacy','5','5','2026-09-02');
      `);

      MIGRATIONS.find((item) => item.id === 28)!.up(db);

      const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(({ name }) => name);
      expect(tables).not.toContain('excess_allocations');
      expect(tables).toContain('legacy_excess_allocations');
      expect(db.prepare('SELECT * FROM legacy_excess_allocations').all()).toHaveLength(1);
      expect(db.prepare("SELECT event_type FROM excess_ledger_events WHERE excess_event_id = 'formal-legacy'").get()).toEqual({
        event_type: 'FORMAL_INCREASE_REGULARIZATION',
      });
      MIGRATIONS.find((item) => item.id === 30)!.up(db);
      const ledger = new ExcessLedgerStore(db);
      expect(ledger.listByAccount('ea-legacy')).toEqual([]);
      expect(ledger.listLegacyFormalIncreaseEventsByAccount('ea-legacy').map(({ eventType }) => eventType)).toEqual(['FORMAL_INCREASE_REGULARIZATION']);
      expect(() => db.exec("INSERT INTO legacy_excess_allocations VALUES ('allocation-new','formal-legacy','approved-legacy','1','1','2026-09-03')")).toThrow(
        /append-only|read-only/,
      );
      expect(() => db.exec("UPDATE legacy_excess_allocations SET amount_usd = '0' WHERE excess_allocation_id = 'allocation-legacy'")).toThrow(/append-only/);
      expect(() => db.exec("DELETE FROM legacy_excess_allocations WHERE excess_allocation_id = 'allocation-legacy'")).toThrow(/append-only/);
      expect(() =>
        db.exec(`INSERT INTO legacy_pre_v4_excess_ledger_events VALUES
          ('formal-new','ea-legacy',NULL,'FORMAL_INCREASE_REGULARIZATION','USD','1','0','1','1','policy-legacy','approved-legacy','maker','2026-09-03')`),
      ).toThrow(/read-only/);
    } finally {
      db.close();
    }
  });
});
