import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../../../src/db/migrations';
import { ExcessLedgerStore } from '../../../src/store/excessLedgerStore';

describe('migration 29 BD-07 reversal removal', () => {
  test('preserves draft reversal rows as read-only legacy audit while excluding them from active aggregates', () => {
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
        CREATE TRIGGER immutable_excess_ledger_events_update
          BEFORE UPDATE ON excess_ledger_events BEGIN SELECT RAISE(ABORT, 'excess_ledger_events is append-only'); END;
        CREATE TRIGGER immutable_excess_ledger_events_delete
          BEFORE DELETE ON excess_ledger_events BEGIN SELECT RAISE(ABORT, 'excess_ledger_events is append-only'); END;
        INSERT INTO excess_accounts VALUES ('ea-legacy','IMPORT_LC','lc-legacy','policy-legacy',1,'2026-09-01','2026-09-01');
        INSERT INTO excess_ledger_events VALUES
          ('approved-legacy','ea-legacy',NULL,'APPROVED_UTILIZATION','USD','25','0','25','25','policy-legacy',NULL,'checker','2026-09-01'),
          ('return-legacy','ea-legacy',NULL,'RETURN_REVERSAL','USD','3','0','3','3','policy-legacy','approved-legacy','maker','2026-09-02'),
          ('cancel-legacy','ea-legacy',NULL,'CANCELLATION_REVERSAL','USD','2','0','2','2','policy-legacy','approved-legacy','maker','2026-09-03');
      `);

      MIGRATIONS.find((item) => item.id === 29)!.up(db);
      MIGRATIONS.find((item) => item.id === 30)!.up(db);

      const ledger = new ExcessLedgerStore(db);
      expect(ledger.listByAccount('ea-legacy')).toEqual([]);
      expect(ledger.aggregateForAccount('ea-legacy', 2)).toEqual({ pendingReservedOwner: '0', approvedUtilizedOwner: '0' });
      expect(ledger.listLegacyReversalEventsByAccount('ea-legacy').map(({ eventType }) => eventType)).toEqual(['RETURN_REVERSAL', 'CANCELLATION_REVERSAL']);
      expect(() =>
        db.exec(`INSERT INTO legacy_pre_v4_excess_ledger_events VALUES
          ('return-new','ea-legacy',NULL,'RETURN_REVERSAL','USD','1','0','1','1','policy-legacy','approved-legacy','maker','2026-09-04')`),
      ).toThrow(/read-only/);
      expect(() =>
        db.exec(`INSERT INTO legacy_pre_v4_excess_ledger_events VALUES
          ('cancel-new','ea-legacy',NULL,'CANCELLATION_REVERSAL','USD','1','0','1','1','policy-legacy','approved-legacy','maker','2026-09-04')`),
      ).toThrow(/read-only/);
      expect(() => db.exec("UPDATE legacy_pre_v4_excess_ledger_events SET amount_usd = '0' WHERE excess_event_id = 'return-legacy'")).toThrow(/read-only/);
      expect(() => db.exec("DELETE FROM legacy_pre_v4_excess_ledger_events WHERE excess_event_id = 'return-legacy'")).toThrow(/read-only/);
    } finally {
      db.close();
    }
  });
});
