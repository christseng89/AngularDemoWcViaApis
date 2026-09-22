import { createDb, type Db } from '../../../src/db';
import { runMigrations } from '../../../src/db/migrations';

const appendOnlyTables = ['excess_ledger_events', 'excess_allocations', 'fx_rate_snapshots', 'sg_capacity_events', 'command_idempotency'] as const;

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
        'excess_allocations',
        'fx_rate_snapshots',
        'sg_capacity_events',
        'command_idempotency',
      ]),
    );
  });

  test('enforces exactly one allowance account per owner and valid owner type', () => {
    const insert = db.prepare(`INSERT INTO excess_accounts (
      excess_account_id, owner_type, owner_id, policy_version, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    insert.run('ea-1', 'IMPORT_LC', 'logical-lc-1', 'policy-1', 1, '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z');
    expect(() => insert.run('ea-2', 'IMPORT_LC', 'logical-lc-1', 'policy-1', 1, '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z')).toThrow(
      /UNIQUE constraint failed/,
    );
    expect(() => insert.run('ea-3', 'UNKNOWN', 'logical-lc-2', 'policy-1', 1, '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z')).toThrow(
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

  test('rejects production-invalid FX purpose and decision point values at the DB boundary', () => {
    const insert = db.prepare(`INSERT INTO fx_rate_snapshots (
      fx_snapshot_id, movement_id, decision_point, base_currency, quote_currency, rate_purpose,
      booking_rate, converted_amount_usd, rate_source, provider_rate_id, provider_rate_version,
      rate_timestamp, approval_status, effective_from, effective_to, freshness_status,
      correlation_id, policy_version, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    expect(() =>
      insert.run(
        'fx-1',
        null,
        'UNKNOWN',
        'EUR',
        'USD',
        'MIDPOINT',
        '1.1',
        '110',
        'PROVIDER',
        'rate-1',
        'v1',
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
      DROP TABLE excess_allocations;
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
});
