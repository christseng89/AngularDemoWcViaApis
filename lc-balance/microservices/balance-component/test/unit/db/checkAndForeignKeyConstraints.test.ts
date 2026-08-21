/**
 * analysis/Balance-Component-DB-Optimization-Analysis.md P1 (2026-08-21) — direct proof that the CHECK/FK
 * constraints schema.ts now declares (and migration 13 retrofits onto a pre-existing on-disk file) are
 * actually enforced by SQLite itself, not merely present in the CREATE TABLE text. Every insert here goes
 * through raw SQL, deliberately bypassing BalanceService/the store layer's own TS-level validation — the
 * whole point of a DB-level CHECK/FK is defense-in-depth against a caller that ISN'T the app's own
 * validated API surface (a bad migration, a manual fixup script, a future second service writing to the
 * same DB). If the app-level validation is the only thing stopping a bad value, this constraint doesn't
 * actually add anything.
 */
import { DatabaseSync } from 'node:sqlite';
import { createDb } from '../../../src/db';

function baseContractRow(overrides: Record<string, unknown> = {}) {
  return {
    balance_contract_id: 'c1',
    logical_contract_id: 'lc1',
    contract_version: 1,
    instrument_type: 'IPLC_LC',
    lc_number: 'LC0001',
    status: 'ACTIVE',
    currency: 'USD',
    opening_balance: '0',
    effective_from: '2026-01-01T00:00:00Z',
    created_by: 'maker1',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function insertContract(db: DatabaseSync, row: Record<string, unknown>): void {
  const cols = Object.keys(row);
  db.prepare(`INSERT INTO balance_contracts (${cols.join(', ')}) VALUES (${cols.map((c) => `@${c}`).join(', ')})`).run(row as never);
}

function baseMovementRow(overrides: Record<string, unknown> = {}) {
  return {
    movement_id: 'm1',
    balance_contract_id: 'c1',
    event_seq: 1,
    movement_type: 'ISSUE',
    exposure_nature: 'CONTINGENT',
    amount: '1000',
    ceiling_amount: '1000',
    currency: 'USD',
    status: 'PENDING',
    created_by: 'maker1',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function insertMovement(db: DatabaseSync, row: Record<string, unknown>): void {
  const cols = Object.keys(row);
  db.prepare(`INSERT INTO balance_movements (${cols.join(', ')}) VALUES (${cols.map((c) => `@${c}`).join(', ')})`).run(row as never);
}

describe('balance_contracts CHECK constraints', () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = createDb(':memory:');
  });
  afterEach(() => db.close());

  test('rejects an instrument_type outside InstrumentType', () => {
    expect(() => insertContract(db, baseContractRow({ instrument_type: 'NOT_A_REAL_TYPE' }))).toThrow(/CHECK constraint failed/);
  });

  test('accepts every real InstrumentType value', () => {
    const values = [
      'IPLC_LC',
      'EPLC_LC',
      'IPLC_ACCEPTANCE',
      'EPLC_ACCEPTANCE',
      'SHGT',
      'EPLC_CONFIRMATION',
      'EPLC_DUE_FROM_ISSUING_BANK',
      'EPLC_ACCEPTANCE_REIMB_RECEIVABLE',
      'EPLC_EXPORT_BILLS_DISCOUNTED',
      'EPLC_EXAMINATION',
    ];
    values.forEach((v, i) => {
      expect(() => insertContract(db, baseContractRow({ balance_contract_id: `c-${i}`, logical_contract_id: `lc-${i}`, instrument_type: v }))).not.toThrow();
    });
  });

  test('rejects a status outside ContractStatus', () => {
    expect(() => insertContract(db, baseContractRow({ status: 'NOT_A_REAL_STATUS' }))).toThrow(/CHECK constraint failed/);
  });

  test('accepts every real ContractStatus value', () => {
    ['ACTIVE', 'SUPERSEDED', 'CLOSED', 'CANCELLED'].forEach((v, i) => {
      expect(() => insertContract(db, baseContractRow({ balance_contract_id: `c-${i}`, logical_contract_id: `lc-${i}`, status: v }))).not.toThrow();
    });
  });

  test('rejects a non-NULL tenor_type outside TenorType', () => {
    expect(() => insertContract(db, baseContractRow({ tenor_type: 'NOT_A_REAL_TENOR' }))).toThrow(/CHECK constraint failed/);
  });

  test('accepts a NULL tenor_type — SHGT/Acceptance/Examination contracts genuinely have none (the "IS NULL OR" branch, not merely an untested bare IN() that happens to also let NULL through)', () => {
    expect(() => insertContract(db, baseContractRow({ tenor_type: null }))).not.toThrow();
  });

  test('accepts every real TenorType value', () => {
    ['SIGHT', 'BUYERS_USANCE', 'SELLERS_USANCE', 'DP', 'DA'].forEach((v, i) => {
      expect(() => insertContract(db, baseContractRow({ balance_contract_id: `c-${i}`, logical_contract_id: `lc-${i}`, tenor_type: v }))).not.toThrow();
    });
  });
});

describe('balance_movements CHECK constraints', () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = createDb(':memory:');
    insertContract(db, baseContractRow());
  });
  afterEach(() => db.close());

  test('rejects a movement_type outside BalanceService.movementTypeRegistry\'s own key set', () => {
    expect(() => insertMovement(db, baseMovementRow({ movement_type: 'NOT_A_REAL_MOVEMENT_TYPE' }))).toThrow(/CHECK constraint failed/);
  });

  test('accepts every real movementTypeRegistry value', () => {
    const values = [
      'ISSUE',
      'CREATE',
      'AMEND_INCREASE',
      'AMEND',
      'AMEND_DECREASE',
      'UTILIZE',
      'HONOUR',
      'ACCEPT',
      'PARTIAL_REDEEM',
      'FULL_REDEEM',
      'REIMBURSE',
      'RECLASSIFY_OUT',
      'PARTIAL_SETTLE',
      'FULL_SETTLE',
      'CLOSE',
    ];
    values.forEach((v, i) => {
      expect(() => insertMovement(db, baseMovementRow({ movement_id: `m-${i}`, event_seq: i + 1, movement_type: v }))).not.toThrow();
    });
  });

  test('rejects an exposure_nature outside ExposureNature', () => {
    expect(() => insertMovement(db, baseMovementRow({ exposure_nature: 'NOT_A_REAL_NATURE' }))).toThrow(/CHECK constraint failed/);
  });

  test('accepts every real ExposureNature value', () => {
    ['CONTINGENT', 'ACTUAL', 'MEMO'].forEach((v, i) => {
      expect(() => insertMovement(db, baseMovementRow({ movement_id: `m-${i}`, event_seq: i + 1, exposure_nature: v }))).not.toThrow();
    });
  });

  test('rejects a status outside MovementStatus', () => {
    expect(() => insertMovement(db, baseMovementRow({ status: 'NOT_A_REAL_STATUS' }))).toThrow(/CHECK constraint failed/);
  });

  test('accepts every real MovementStatus value', () => {
    ['PENDING', 'RELEASED', 'REJECTED', 'CANCELLED', 'SUPERSEDED'].forEach((v, i) => {
      expect(() => insertMovement(db, baseMovementRow({ movement_id: `m-${i}`, event_seq: i + 1, status: v }))).not.toThrow();
    });
  });
});

describe('self-referencing FK constraints', () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = createDb(':memory:');
  });
  afterEach(() => db.close());

  test('supersedes_balance_contract_id pointing at a non-existent balance_contract_id is rejected', () => {
    expect(() => insertContract(db, baseContractRow({ supersedes_balance_contract_id: 'no-such-contract' }))).toThrow(/FOREIGN KEY constraint failed/);
  });

  test('superseded_by_balance_contract_id pointing at a non-existent balance_contract_id is rejected', () => {
    expect(() => insertContract(db, baseContractRow({ superseded_by_balance_contract_id: 'no-such-contract' }))).toThrow(/FOREIGN KEY constraint failed/);
  });

  test('supersedes_balance_contract_id pointing at a REAL, already-inserted balance_contract_id is accepted', () => {
    // Different logical_contract_id, not a real version-succession — this test is only proving the FK
    // reference resolves, not exercising the "at most one ACTIVE per logicalContractId" partial unique
    // index too (that's markSuperseded()'s own dedicated test in schema.test.ts).
    insertContract(db, baseContractRow({ balance_contract_id: 'c1', logical_contract_id: 'lc1' }));
    expect(() =>
      insertContract(db, baseContractRow({ balance_contract_id: 'c2', logical_contract_id: 'lc2', supersedes_balance_contract_id: 'c1' })),
    ).not.toThrow();
  });

  test('superseded_movement_id pointing at a non-existent movement_id is rejected', () => {
    insertContract(db, baseContractRow());
    expect(() => insertMovement(db, baseMovementRow({ superseded_movement_id: 'no-such-movement' }))).toThrow(/FOREIGN KEY constraint failed/);
  });

  test('reversal_of_movement_id pointing at a non-existent movement_id is rejected', () => {
    insertContract(db, baseContractRow());
    expect(() => insertMovement(db, baseMovementRow({ reversal_of_movement_id: 'no-such-movement' }))).toThrow(/FOREIGN KEY constraint failed/);
  });

  test('superseded_movement_id/reversal_of_movement_id pointing at a REAL, already-inserted movement_id is accepted', () => {
    insertContract(db, baseContractRow());
    insertMovement(db, baseMovementRow({ movement_id: 'm1', event_seq: 1 }));
    expect(() => insertMovement(db, baseMovementRow({ movement_id: 'm2', event_seq: 2, superseded_movement_id: 'm1', reversal_of_movement_id: 'm1' }))).not.toThrow();
  });
});
