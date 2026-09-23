import { DatabaseSync } from 'node:sqlite';
import { createDb } from '../../../src/db';
import { MIGRATIONS } from '../../../src/db/migrations';

function columns(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(({ name }) => name);
}

describe('migration 30 V4 owner-currency persistence', () => {
  test('fresh active schema stores allowance and direct USD-to-owner FX facts without USD-direction residue', () => {
    const db = createDb(':memory:');
    try {
      expect(columns(db, 'excess_accounts')).toContain('owner_currency');
      expect(columns(db, 'excess_ledger_events')).toEqual(
        expect.arrayContaining(['owner_currency', 'transaction_amount_owner', 'covered_amount_owner', 'excess_amount_owner', 'allowance_amount_owner']),
      );
      expect(columns(db, 'excess_ledger_events')).not.toContain('amount_usd');

      expect(columns(db, 'fx_rate_snapshots')).toEqual(
        expect.arrayContaining(['from_currency', 'to_currency', 'requested_amount_usd', 'converted_amount_owner', 'request_attempt_id', 'rate_origin']),
      );
      expect(columns(db, 'fx_rate_snapshots')).not.toEqual(expect.arrayContaining(['base_currency', 'quote_currency', 'converted_amount_usd']));

      const sql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'fx_rate_snapshots'").get() as { sql: string }).sql;
      expect(sql).toContain("from_currency            TEXT NOT NULL CHECK (from_currency = 'USD')");
      expect(sql).not.toContain("quote_currency = 'USD'");
    } finally {
      db.close();
    }
  });

  test('quarantines populated pre-V4 USD-direction rows as read-only legacy evidence without copying them into active aggregates', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE excess_accounts (
          excess_account_id TEXT PRIMARY KEY, owner_type TEXT NOT NULL, owner_id TEXT NOT NULL,
          policy_version TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE excess_ledger_events (
          excess_event_id TEXT PRIMARY KEY, excess_account_id TEXT NOT NULL REFERENCES excess_accounts(excess_account_id),
          movement_id TEXT, event_type TEXT NOT NULL, transaction_currency TEXT NOT NULL, transaction_amount TEXT NOT NULL,
          covered_amount TEXT NOT NULL, excess_amount TEXT NOT NULL, amount_usd TEXT NOT NULL, policy_version TEXT NOT NULL,
          source_excess_event_id TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE fx_rate_snapshots (
          fx_snapshot_id TEXT PRIMARY KEY, movement_id TEXT, decision_point TEXT NOT NULL,
          base_currency TEXT NOT NULL, quote_currency TEXT NOT NULL, rate_purpose TEXT NOT NULL,
          booking_rate TEXT NOT NULL, converted_amount_usd TEXT NOT NULL, rate_source TEXT NOT NULL,
          provider_rate_id TEXT NOT NULL, provider_rate_version TEXT NOT NULL, rate_timestamp TEXT NOT NULL,
          approval_status TEXT NOT NULL, effective_from TEXT NOT NULL, effective_to TEXT, freshness_status TEXT NOT NULL,
          rate_origin TEXT NOT NULL, correlation_id TEXT NOT NULL, policy_version TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE command_idempotency (
          idempotency_record_id TEXT PRIMARY KEY, command_type TEXT NOT NULL, owner_id TEXT NOT NULL,
          actor_context TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL,
          response_status INTEGER NOT NULL, response_body TEXT NOT NULL, created_at TEXT NOT NULL
        );
        INSERT INTO excess_accounts VALUES ('old-account','IMPORT_LC','old-owner','old-policy',1,'2026-01-01','2026-01-01');
        INSERT INTO excess_ledger_events VALUES
          ('old-event','old-account',NULL,'PENDING_RESERVATION','EUR','100','80','20','22','old-policy',NULL,'maker','2026-01-01');
        INSERT INTO fx_rate_snapshots VALUES
          ('old-fx',NULL,'MAKER_SUBMIT','EUR','USD','BOOKING','1.1','22','OLD','old-rate','old-v','2026-01-01',
           'APPROVED','2026-01-01',NULL,'FRESH','PROVIDER_SUPPLIED','old-corr','old-policy','2026-01-01');
        INSERT INTO command_idempotency VALUES
          ('old-idem','MAKER_SUBMIT','old-owner','maker','key','hash',201,'{}','2026-01-01');
      `);

      MIGRATIONS.find(({ id }) => id === 30)!.up(db);

      expect(db.prepare('SELECT COUNT(*) AS count FROM legacy_pre_v4_excess_ledger_events').get()).toEqual({ count: 1 });
      expect(db.prepare('SELECT COUNT(*) AS count FROM legacy_pre_v4_fx_rate_snapshots').get()).toEqual({ count: 1 });
      expect(db.prepare('SELECT COUNT(*) AS count FROM legacy_pre_v4_command_idempotency').get()).toEqual({ count: 1 });
      expect(db.prepare('SELECT COUNT(*) AS count FROM excess_ledger_events').get()).toEqual({ count: 0 });
      expect(db.prepare('SELECT COUNT(*) AS count FROM fx_rate_snapshots').get()).toEqual({ count: 0 });
      expect(() => db.exec("UPDATE legacy_pre_v4_excess_ledger_events SET amount_usd = '0'")).toThrow(/read-only|append-only/);
      expect(() => db.exec('DELETE FROM legacy_pre_v4_fx_rate_snapshots')).toThrow(/read-only|append-only/);
    } finally {
      db.close();
    }
  });

  test('rolls back the entire quarantine when a legacy target collision makes migration unsafe', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE excess_accounts (
          excess_account_id TEXT PRIMARY KEY, owner_type TEXT NOT NULL, owner_id TEXT NOT NULL,
          policy_version TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE legacy_pre_v4_excess_accounts (sentinel TEXT PRIMARY KEY);
        INSERT INTO excess_accounts VALUES ('active-old','IMPORT_LC','owner','policy',1,'2026-01-01','2026-01-01');
        INSERT INTO legacy_pre_v4_excess_accounts VALUES ('keep-me');
      `);

      expect(() => MIGRATIONS.find(({ id }) => id === 30)!.up(db)).toThrow(/already another table|legacy_pre_v4_excess_accounts/);
      expect(db.prepare('SELECT excess_account_id FROM excess_accounts').get()).toEqual({ excess_account_id: 'active-old' });
      expect(db.prepare('SELECT sentinel FROM legacy_pre_v4_excess_accounts').get()).toEqual({ sentinel: 'keep-me' });
      expect(columns(db, 'excess_accounts')).not.toContain('owner_currency');
    } finally {
      db.close();
    }
  });
});

describe('migration 31 append-only Excess decision history', () => {
  test('preserves the Maker row and permits a later Checker decision for the same movement', () => {
    const db = createDb(':memory:');
    try {
      db.exec(`
        DROP TRIGGER immutable_excess_decision_snapshots_update;
        DROP TRIGGER immutable_excess_decision_snapshots_delete;
        DROP TABLE excess_decision_snapshots;
        CREATE TABLE excess_decision_snapshots (
          movement_id TEXT PRIMARY KEY, excess_account_id TEXT NOT NULL, facts_version TEXT NOT NULL,
          owner_currency TEXT NOT NULL, effective_limit_owner TEXT NOT NULL, excess_decision TEXT NOT NULL,
          business_result_code TEXT, release_eligibility TEXT NOT NULL, policy_snapshot_json TEXT NOT NULL,
          action TEXT NOT NULL, actor_context TEXT NOT NULL, decision_time TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE INDEX idx_excess_decisions_movement_time
        ON excess_decision_snapshots(movement_id, created_at);
        INSERT INTO balance_contracts (
          balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number,
          status, currency, opening_balance, effective_from, created_by, created_at
        ) VALUES ('contract-1','logical-1',1,'IPLC_LC','LC-M31','ACTIVE','EUR','100','2026-09-22','maker','2026-09-22');
        INSERT INTO balance_movements (
          movement_id, balance_contract_id, event_seq, movement_type, exposure_nature, amount,
          ceiling_amount, currency, status, created_by, created_at
        ) VALUES ('movement-1','contract-1',1,'UTILIZE','CONTINGENT','120','120','EUR','PENDING','maker','2026-09-22');
        INSERT INTO excess_accounts (
          excess_account_id, owner_type, owner_id, owner_currency, policy_version, version, created_at, updated_at
        ) VALUES ('account-1','IMPORT_LC','logical-1','EUR','policy-1',1,'2026-09-22','2026-09-22');
        INSERT INTO excess_decision_snapshots VALUES
          ('movement-1','account-1','facts-1','EUR','10','WITHIN_ALLOWANCE',NULL,'ELIGIBLE','{}',
           'MAKER_SUBMIT','maker-1','2026-09-22T00:00:00Z','2026-09-22T00:00:00Z');
      `);

      MIGRATIONS.find(({ id }) => id === 31)!.up(db);

      expect(columns(db, 'excess_decision_snapshots')).toEqual(expect.arrayContaining(['decision_snapshot_id', 'movement_id', 'command_idempotency_key']));
      expect(db.prepare('SELECT movement_id, action FROM excess_decision_snapshots').get()).toEqual({ movement_id: 'movement-1', action: 'MAKER_SUBMIT' });
      db.prepare(
        `INSERT INTO excess_decision_snapshots (
          decision_snapshot_id, movement_id, excess_account_id, facts_version, owner_currency,
          effective_limit_owner, excess_decision, business_result_code, release_eligibility,
          policy_snapshot_json, action, command_idempotency_key, actor_context, decision_time, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        'checker-1',
        'movement-1',
        'account-1',
        'facts-2',
        'EUR',
        '10',
        'WITHIN_ALLOWANCE',
        null,
        'ELIGIBLE',
        '{}',
        'CHECKER_RELEASE',
        'checker-key-1',
        'checker-1',
        '2026-09-22T01:00:00Z',
        '2026-09-22T01:00:00Z',
      );
      expect(db.prepare("SELECT COUNT(*) AS count FROM excess_decision_snapshots WHERE movement_id = 'movement-1'").get()).toEqual({ count: 2 });
      expect(() => db.prepare("UPDATE legacy_v30_excess_decision_snapshots SET actor_context = 'changed'").run()).toThrow(/read-only/);
    } finally {
      db.close();
    }
  });
});

describe('migration 33 Checker NOT_REQUIRED decision', () => {
  test('upgrades the decision constraint while preserving existing snapshots', () => {
    const db = createDb(':memory:');
    try {
      db.exec(`
        INSERT INTO balance_contracts (
          balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number,
          status, currency, opening_balance, effective_from, created_by, created_at
        ) VALUES ('contract-m33','logical-m33',1,'IPLC_LC','LC-M33','ACTIVE','EUR','100','2026-09-22','maker','2026-09-22');
        INSERT INTO balance_movements (
          movement_id, balance_contract_id, event_seq, movement_type, exposure_nature, amount,
          ceiling_amount, currency, status, created_by, created_at
        ) VALUES ('movement-m33','contract-m33',1,'UTILIZE','CONTINGENT','100','100','EUR','PENDING','maker','2026-09-22');
        INSERT INTO excess_accounts (
          excess_account_id, owner_type, owner_id, owner_currency, policy_version, version, created_at, updated_at
        ) VALUES ('account-m33','IMPORT_LC','logical-m33','EUR','policy-1',1,'2026-09-22','2026-09-22');
        INSERT INTO excess_decision_snapshots (
          decision_snapshot_id, movement_id, excess_account_id, facts_version, owner_currency,
          effective_limit_owner, excess_decision, business_result_code, release_eligibility,
          policy_snapshot_json, action, command_idempotency_key, actor_context, decision_time, created_at
        ) VALUES ('maker-m33','movement-m33','account-m33','facts-1','EUR','10','WITHIN_ALLOWANCE',NULL,
          'ELIGIBLE','{}','MAKER_SUBMIT','maker-key','maker','2026-09-22','2026-09-22');
      `);

      MIGRATIONS.find(({ id }) => id === 33)!.up(db);

      expect(db.prepare("SELECT excess_decision FROM excess_decision_snapshots WHERE decision_snapshot_id = 'maker-m33'").get()).toEqual({
        excess_decision: 'WITHIN_ALLOWANCE',
      });
      expect(() =>
        db.prepare(
          `INSERT INTO excess_decision_snapshots (
            decision_snapshot_id, movement_id, excess_account_id, facts_version, owner_currency,
            effective_limit_owner, excess_decision, business_result_code, release_eligibility,
            policy_snapshot_json, action, command_idempotency_key, actor_context, decision_time, created_at
          ) VALUES ('checker-m33','movement-m33','account-m33','facts-2','EUR','10','NOT_REQUIRED',NULL,
            'ELIGIBLE','{}','CHECKER_RELEASE','checker-key','checker','2026-09-23','2026-09-23')`,
        ).run(),
      ).not.toThrow();
    } finally {
      db.close();
    }
  });
});
