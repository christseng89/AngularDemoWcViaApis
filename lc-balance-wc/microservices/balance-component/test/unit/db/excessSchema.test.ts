import { createDb, type Db } from '../../../src/db';
import { runMigrations } from '../../../src/db/migrations';

const appendOnlyTables = [
  'excess_ledger_events',
  'fx_rate_snapshots',
  'excess_decision_snapshots',
  'sg_capacity_events',
  'command_idempotency',
  'excess_command_attempt_audits',
  'applicant_waiver_snapshots',
  'export_authorization_snapshots',
  'export_asset_postings',
] as const;

describe('v11.15 Excess persistence schema', () => {
  let db: Db;

  beforeEach(() => {
    db = createDb(':memory:');
  });

  afterEach(() => db.close());

  test('creates every append-only Excess, FX, SG-capacity and idempotency table', () => {
    const tableNames = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((row) => row.name));
    expect(tableNames).toEqual(
      expect.objectContaining({
        size: expect.any(Number),
      }),
    );
    expect([...tableNames]).toEqual(
      expect.arrayContaining([
        'excess_accounts',
        'excess_ledger_events',
        'fx_rate_snapshots',
        'sg_capacity_events',
        'command_idempotency',
        'excess_command_attempt_audits',
        'applicant_waiver_snapshots',
        'export_authorization_snapshots',
        'export_asset_postings',
      ]),
    );
    expect(tableNames).not.toContain('excess_allocations');
    expect(tableNames).not.toContain('legacy_excess_allocations');
  });

  test('fresh schema rejects the removed Formal Increase regularization event', () => {
    db.prepare(
      `INSERT INTO excess_accounts (
      excess_account_id, owner_type, owner_id, owner_currency, policy_version, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('ea-formal', 'IMPORT_LC', 'lc-formal', 'EUR', 'policy-1', 1, '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z');

    expect(() =>
      db
        .prepare(
          `INSERT INTO excess_ledger_events (
        excess_event_id, excess_account_id, movement_id, event_type, owner_currency,
        transaction_amount_owner, covered_amount_owner, excess_amount_owner, allowance_amount_owner, policy_version,
        source_excess_event_id, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('formal-1', 'ea-formal', null, 'FORMAL_INCREASE_REGULARIZATION', 'USD', '5', '0', '5', '5', 'policy-1', null, 'maker-1', '2026-09-22T00:00:00Z'),
    ).toThrow(/FORMAL_INCREASE_REGULARIZATION|CHECK constraint failed/);
  });

  test.each(['RETURN_REVERSAL', 'CANCELLATION_REVERSAL'] as const)('fresh schema rejects removed active reversal event %s', (eventType) => {
    db.prepare(
      `INSERT INTO excess_accounts (
      excess_account_id, owner_type, owner_id, owner_currency, policy_version, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(`ea-${eventType}`, 'IMPORT_LC', `lc-${eventType}`, 'EUR', 'policy-1', 1, '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z');

    expect(() =>
      db
        .prepare(
          `INSERT INTO excess_ledger_events (
        excess_event_id, excess_account_id, movement_id, event_type, owner_currency,
        transaction_amount_owner, covered_amount_owner, excess_amount_owner, allowance_amount_owner, policy_version,
        source_excess_event_id, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(`event-${eventType}`, `ea-${eventType}`, null, eventType, 'USD', '5', '0', '5', '5', 'policy-1', null, 'maker-1', '2026-09-22T00:00:00Z'),
    ).toThrow(/disabled by BD-07|CHECK constraint failed/);
  });

  test('fresh SG capacity schema rejects the unapproved RESTORE event', () => {
    db.prepare(
      `INSERT INTO balance_contracts (
        balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number,
        status, currency, opening_balance, effective_from, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('restore-contract', 'restore-owner', 1, 'SHGT', 'RESTORE-LC', 'ACTIVE', 'USD', '100', '2026-09-22', 'maker', '2026-09-22');
    db.prepare(
      `INSERT INTO balance_movements (
        movement_id, balance_contract_id, event_seq, movement_type, exposure_nature, amount,
        ceiling_amount, currency, status, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('restore-movement', 'restore-contract', 1, 'ISSUE', 'CONTINGENT', '100', '100', 'USD', 'RELEASED', 'maker', '2026-09-22');

    expect(() =>
      db
        .prepare(
          `INSERT INTO sg_capacity_events (
            sg_capacity_event_id, sg_balance_contract_id, source_movement_id, event_type,
            transaction_currency, capacity_amount, covered_amount, excess_amount,
            source_capacity_event_id, created_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('restore-event', 'restore-contract', 'restore-movement', 'RESTORE', 'USD', '10', '10', '0', null, 'maker', '2026-09-22'),
    ).toThrow(/CHECK constraint failed/);
  });

  test('enforces exactly one allowance account per owner and valid owner type', () => {
    const insert = db.prepare(`INSERT INTO excess_accounts (
      excess_account_id, owner_type, owner_id, owner_currency, policy_version, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    insert.run('ea-1', 'IMPORT_LC', 'logical-lc-1', 'EUR', 'policy-1', 1, '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z');
    expect(() => insert.run('ea-2', 'IMPORT_LC', 'logical-lc-1', 'EUR', 'policy-1', 1, '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z')).toThrow(
      /UNIQUE constraint failed/,
    );
    expect(() => insert.run('ea-3', 'UNKNOWN', 'logical-lc-2', 'EUR', 'policy-1', 1, '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z')).toThrow(
      /CHECK constraint failed/,
    );
  });

  test('enforces idempotency scope uniqueness and bounded command status', () => {
    const insert = db.prepare(`INSERT INTO command_idempotency (
      idempotency_record_id, command_type, owner_id, actor_context, idempotency_key,
      request_hash, response_status, response_body, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insert.run('idem-1', 'MAKER_SUBMIT', 'owner-1', 'maker-1', 'key-1', 'hash-1', 201, '{}', '2026-09-22T00:00:00Z');
    expect(() => insert.run('idem-2', 'MAKER_SUBMIT', 'owner-1', 'maker-1', 'key-1', 'hash-2', 201, '{}', '2026-09-22T00:00:00Z')).toThrow(
      /UNIQUE constraint failed/,
    );
    expect(() => insert.run('idem-3', 'MAKER_SUBMIT', 'owner-2', 'maker-2', 'key-2', 'hash-3', 99, '{}', '2026-09-22T00:00:00Z')).toThrow(
      /CHECK constraint failed/,
    );
  });

  test('constrains Checker command-attempt audits to fail-closed FX outcomes', () => {
    db.prepare(
      `INSERT INTO balance_contracts (
        balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number,
        status, currency, opening_balance, effective_from, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('audit-contract', 'audit-owner', 1, 'IPLC_LC', 'AUDIT-LC', 'ACTIVE', 'EUR', '100', '2026-09-22', 'maker', '2026-09-22');
    db.prepare(
      `INSERT INTO balance_movements (
        movement_id, balance_contract_id, event_seq, movement_type, exposure_nature, amount,
        ceiling_amount, currency, status, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('audit-movement', 'audit-contract', 1, 'UTILIZE', 'CONTINGENT', '20', '20', 'EUR', 'PENDING', 'maker', '2026-09-22');
    const insert = db.prepare(
      `INSERT INTO excess_command_attempt_audits (
        command_attempt_audit_id, command_type, movement_id, owner_type, owner_id, owner_currency,
        actor_context, command_idempotency_key, request_hash, result_code, policy_version, from_currency,
        to_currency, requested_amount_usd, rate_purpose, decision_time, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    expect(() =>
      insert.run(
        'bad-audit',
        'CHECKER_RELEASE',
        'audit-movement',
        'IMPORT_LC',
        'audit-owner',
        'EUR',
        'checker',
        'key-1',
        'request-hash-1',
        'FX_RATE_PENDING',
        'policy-1',
        'USD',
        'EUR',
        '1000',
        'BOOKING',
        '2026-09-22',
        '2026-09-22',
      ),
    ).toThrow(/CHECK constraint failed/);
  });

  test('rejects production-invalid FX purpose and decision point values at the DB boundary', () => {
    const insert = db.prepare(`INSERT INTO fx_rate_snapshots (
      fx_snapshot_id, movement_id, decision_point, from_currency, to_currency, requested_amount_usd, rate_purpose,
      booking_rate, converted_amount_owner, rate_source, provider_rate_id, provider_rate_version, request_attempt_id,
      rate_timestamp, approval_status, effective_from, effective_to, freshness_status,
      correlation_id, policy_version, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    expect(() =>
      insert.run(
        'fx-1',
        null,
        'UNKNOWN',
        'EUR',
        'USD',
        '100',
        'MIDPOINT',
        '1.1',
        '110',
        'PROVIDER',
        'rate-1',
        'v1',
        'attempt-1',
        '2026-09-22T00:00:00Z',
        'APPROVED',
        '2026-09-22T00:00:00Z',
        null,
        'FRESH',
        'corr-1',
        'policy-1',
        '2026-09-22T00:00:00Z',
      ),
    ).toThrow(/CHECK constraint failed/);
  });

  test('database triggers reject UPDATE and DELETE for every append-only fact table', () => {
    const triggerRows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'immutable_%'").all() as { name: string }[];
    const triggerNames = new Set(triggerRows.map(({ name }) => name));

    for (const table of appendOnlyTables) {
      expect(triggerNames).toEqual(expect.objectContaining({ size: expect.any(Number) }));
      expect(triggerNames.has(`immutable_${table}_update`)).toBe(true);
      expect(triggerNames.has(`immutable_${table}_delete`)).toBe(true);
    }

    db.prepare(
      `INSERT INTO command_idempotency (
      idempotency_record_id, command_type, owner_id, actor_context, idempotency_key,
      request_hash, response_status, response_body, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('immutable-1', 'MAKER_SUBMIT', 'owner-1', 'maker-1', 'key-1', 'hash-1', 201, '{}', '2026-09-22T00:00:00Z');
    expect(() => db.prepare('UPDATE command_idempotency SET response_status = 200 WHERE idempotency_record_id = ?').run('immutable-1')).toThrow(/append-only/);
    expect(() => db.prepare('DELETE FROM command_idempotency WHERE idempotency_record_id = ?').run('immutable-1')).toThrow(/append-only/);
  });

  test('migration 27 preserves pre-existing business rows and is repeatable', () => {
    db.prepare(
      `INSERT INTO balance_contracts (
      balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number,
      status, currency, opening_balance, effective_from, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('contract-before-27', 'logical-before-27', 1, 'IPLC_LC', 'LC-BEFORE-27', 'ACTIVE', 'USD', '100', '2026-09-01', 'fixture', '2026-09-01');

    db.exec(`
      DROP TABLE command_idempotency;
      DROP TABLE sg_capacity_events;
      DROP TABLE fx_rate_snapshots;
      DROP TABLE excess_ledger_events;
      DROP TABLE excess_accounts;
      DELETE FROM schema_migrations WHERE id = 27;
    `);

    runMigrations(db);
    runMigrations(db);

    expect(db.prepare('SELECT lc_number FROM balance_contracts WHERE balance_contract_id = ?').get('contract-before-27')).toEqual({
      lc_number: 'LC-BEFORE-27',
    });
    expect(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations WHERE id = 27').get()).toEqual({ count: 1 });
  });

  test('migration 32 restores the Checker command-attempt audit schema repeatably', () => {
    db.exec(`
      DROP TABLE excess_command_attempt_audits;
      DELETE FROM schema_migrations WHERE id = 32;
    `);

    runMigrations(db);
    runMigrations(db);

    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'excess_command_attempt_audits'").get()).toEqual({
      name: 'excess_command_attempt_audits',
    });
    expect(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations WHERE id = 32').get()).toEqual({ count: 1 });
  });

  test('migration 34 isolates a legacy RESTORE-capable SG capacity table and recreates the active contract without RESTORE', () => {
    db.exec(`
      DROP INDEX IF EXISTS idx_sg_capacity_contract_time;
      DROP TRIGGER IF EXISTS immutable_sg_capacity_events_update;
      DROP TRIGGER IF EXISTS immutable_sg_capacity_events_delete;
      DROP TABLE sg_capacity_events;
      CREATE TABLE sg_capacity_events (
        sg_capacity_event_id TEXT PRIMARY KEY,
        sg_balance_contract_id TEXT NOT NULL REFERENCES balance_contracts(balance_contract_id),
        source_movement_id TEXT NOT NULL REFERENCES balance_movements(movement_id),
        event_type TEXT NOT NULL CHECK (event_type IN ('INITIALIZE','RESERVE','REDEEM','RESTORE','REVERSE')),
        transaction_currency TEXT NOT NULL,
        capacity_amount TEXT NOT NULL,
        covered_amount TEXT NOT NULL,
        excess_amount TEXT NOT NULL,
        source_capacity_event_id TEXT REFERENCES sg_capacity_events(sg_capacity_event_id),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      DELETE FROM schema_migrations WHERE id = 34;
    `);

    runMigrations(db);
    runMigrations(db);

    const activeSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sg_capacity_events'").get() as { sql: string }).sql;
    expect(activeSql).not.toContain("'RESTORE'");
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'legacy_pre_m34_sg_capacity_events'").get()).toEqual({
      name: 'legacy_pre_m34_sg_capacity_events',
    });
    expect(() => db.prepare("INSERT INTO legacy_pre_m34_sg_capacity_events VALUES ('x','x','x','RESTORE','USD','1','1','0',NULL,'x','x')").run()).toThrow(
      /read-only/,
    );
    expect(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations WHERE id = 34').get()).toEqual({ count: 1 });
  });
});
