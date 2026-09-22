import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createDb, type Db } from '../../../src/db';

function openRaw(dbPath: string): Db {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

function seedReferencedExcessFacts(db: Db): void {
  db.prepare(
    `INSERT INTO balance_contracts (
    balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number,
    status, currency, opening_balance, effective_from, created_by, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('contract-1', 'logical-1', 1, 'IPLC_LC', 'LC-CLEAN', 'ACTIVE', 'USD', '100', '2026-09-01', 'fixture', '2026-09-01');
  db.prepare(
    `INSERT INTO balance_movements (
    movement_id, balance_contract_id, event_seq, movement_type, exposure_nature, amount,
    ceiling_amount, currency, status, created_by, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('movement-1', 'contract-1', 1, 'ISSUE', 'CONTINGENT', '100', '100', 'USD', 'PENDING', 'maker', '2026-09-01');
  db.prepare(
    `INSERT INTO excess_accounts (
    excess_account_id, owner_type, owner_id, policy_version, version, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run('account-1', 'IMPORT_LC', 'logical-1', 'policy-1', 1, '2026-09-01', '2026-09-01');
  db.prepare(
    `INSERT INTO excess_ledger_events (
    excess_event_id, excess_account_id, movement_id, event_type, transaction_currency,
    transaction_amount, covered_amount, excess_amount, amount_usd, policy_version,
    source_excess_event_id, created_by, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('event-1', 'account-1', 'movement-1', 'PENDING_RESERVATION', 'USD', '10', '0', '10', '10', 'policy-1', null, 'maker', '2026-09-01');
  db.prepare(
    `INSERT INTO fx_rate_snapshots (
    fx_snapshot_id, movement_id, decision_point, base_currency, quote_currency, rate_purpose,
    booking_rate, converted_amount_usd, rate_source, provider_rate_id, provider_rate_version,
    rate_timestamp, approval_status, effective_from, effective_to, freshness_status,
    correlation_id, policy_version, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'fx-1',
    'movement-1',
    'MAKER_SUBMIT',
    'USD',
    'USD',
    'BOOKING',
    '1',
    '10',
    'USD_PAR',
    'USD_PAR',
    '1',
    '2026-09-01',
    'APPROVED',
    '2026-09-01',
    null,
    'FRESH',
    'corr-1',
    'policy-1',
    '2026-09-01',
  );
  db.prepare(
    `INSERT INTO sg_capacity_events (
    sg_capacity_event_id, sg_balance_contract_id, source_movement_id, event_type,
    transaction_currency, capacity_amount, covered_amount, excess_amount, created_by, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('sg-1', 'contract-1', 'movement-1', 'INITIALIZE', 'USD', '10', '0', '10', 'checker', '2026-09-01');
}

describe('cleanup scripts with immutable Excess facts', () => {
  test('cleanup-all removes child facts before parents and restores immutable triggers', () => {
    const directory = mkdtempSync(join(tmpdir(), 'balance-cleanup-'));
    const dbPath = join(directory, 'balance.sqlite');
    let db = createDb(dbPath);
    seedReferencedExcessFacts(db);
    db.close();

    const result = spawnSync(process.execPath, [resolve(__dirname, '../../../scripts/cleanup-all.mjs')], {
      cwd: resolve(__dirname, '../../..'),
      env: { ...process.env, DB_PATH: dbPath },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    db = openRaw(dbPath);
    expect(db.prepare('SELECT COUNT(*) AS count FROM balance_contracts').get()).toEqual({ count: 0 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM excess_ledger_events').get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'immutable_%'").get()).toEqual({ count: 10 });
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });

  test('cleanup-by-lc removes the selected LC child facts before its parents', () => {
    const directory = mkdtempSync(join(tmpdir(), 'balance-cleanup-lc-'));
    const dbPath = join(directory, 'balance.sqlite');
    let db = createDb(dbPath);
    seedReferencedExcessFacts(db);
    db.close();

    const result = spawnSync(process.execPath, [resolve(__dirname, '../../../scripts/cleanup-by-lc.mjs'), 'LC-CLEAN'], {
      cwd: resolve(__dirname, '../../..'),
      env: { ...process.env, DB_PATH: dbPath },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    db = openRaw(dbPath);
    expect(db.prepare('SELECT COUNT(*) AS count FROM balance_contracts WHERE lc_number = ?').get('LC-CLEAN')).toEqual({ count: 0 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM excess_accounts').get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'immutable_%'").get()).toEqual({ count: 10 });
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });

  test('cleanup failure rolls back deletes and immutable-trigger suspension', () => {
    const directory = mkdtempSync(join(tmpdir(), 'balance-cleanup-rollback-'));
    const dbPath = join(directory, 'balance.sqlite');
    let db = createDb(dbPath);
    seedReferencedExcessFacts(db);
    db.exec('CREATE TABLE cleanup_blocker (movement_id TEXT NOT NULL REFERENCES balance_movements(movement_id))');
    db.prepare('INSERT INTO cleanup_blocker (movement_id) VALUES (?)').run('movement-1');
    db.close();

    const result = spawnSync(process.execPath, [resolve(__dirname, '../../../scripts/cleanup-all.mjs')], {
      cwd: resolve(__dirname, '../../..'),
      env: { ...process.env, DB_PATH: dbPath },
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    db = openRaw(dbPath);
    expect(db.prepare('SELECT COUNT(*) AS count FROM balance_movements').get()).toEqual({ count: 1 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM excess_ledger_events').get()).toEqual({ count: 1 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'immutable_%'").get()).toEqual({ count: 10 });
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
});
