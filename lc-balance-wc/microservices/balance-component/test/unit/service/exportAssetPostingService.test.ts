import { createDb, type Db } from '../../../src/db';
import { MakerCheckerConflictError, RequestValidationError } from '../../../src/errors';
import { BalanceService } from '../../../src/service/balanceService';
import { ExportAssetStore } from '../../../src/store/exportAssetStore';
import request from 'supertest';
import { createApp } from '../../../src/app';

function seedB4(db: Db, tenor: 'SIGHT' | 'SELLERS_USANCE', b4Type: 'HONOUR' | 'ACCEPT'): void {
  db.prepare(
    `INSERT INTO balance_contracts (
    balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number, status,
    currency, opening_balance, tenor_type, effective_from, created_by, created_at
  ) VALUES ('confirmation', 'confirmation-logical', 1, 'EPLC_CONFIRMATION', 'EXP-1', 'ACTIVE',
    'EUR', '10200', ?, '2026-09-23', 'maker', '2026-09-23T00:00:00Z')`,
  ).run(tenor);
  db.prepare(
    `INSERT INTO balance_contracts (
    balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number, parent_logical_contract_id,
    status, currency, opening_balance, effective_from, created_by, created_at
  ) VALUES ('exam', 'exam-logical', 1, 'EPLC_EXAMINATION', 'EXP-1', 'confirmation-logical',
    'ACTIVE', 'EUR', '10200', '2026-09-23', 'maker', '2026-09-23T00:00:00Z')`,
  ).run();
  const insert = db.prepare(`INSERT INTO balance_movements (
    movement_id, balance_contract_id, event_seq, movement_type, exposure_nature, amount, ceiling_amount,
    currency, status, created_by, created_at, released_by, released_at, referenced_transaction_id, business_event_id,
    source_transaction_ref
  ) VALUES (?, ?, ?, ?, 'CONTINGENT', ?, ?, 'EUR', ?, ?, '2026-09-23T00:00:00Z', ?, ?, ?, ?, ?)`);
  insert.run(
    'issue',
    'confirmation',
    1,
    'ISSUE',
    '10000',
    '10000',
    'RELEASED',
    'issue-maker',
    'issue-checker',
    '2026-09-23T00:10:00Z',
    null,
    'issue-event',
    null,
  );
  insert.run('b3', 'exam', 1, 'CREATE', '10200', '10000', 'RELEASED', 'b3-maker', 'b3-checker', '2026-09-23T00:20:00Z', null, 'b3-event', 'PRESENT-DOCS-1');
  insert.run('b4', 'confirmation', 2, b4Type, '10200', '10000', 'PENDING', 'b4-maker', null, null, 'b3', 'b4-event', 'BILL-1');
  db.prepare(
    `INSERT INTO excess_accounts (
    excess_account_id, owner_type, owner_id, owner_currency, policy_version, version, created_at, updated_at
  ) VALUES ('excess-account', 'EXPORT_CONFIRMATION', 'confirmation-logical', 'EUR', 'policy-1', 1,
    '2026-09-23T00:00:00Z', '2026-09-23T00:00:00Z')`,
  ).run();
  db.prepare(
    `INSERT INTO excess_ledger_events (
    excess_event_id, excess_account_id, movement_id, event_type, owner_currency,
    transaction_amount_owner, covered_amount_owner, excess_amount_owner, allowance_amount_owner,
    policy_version, source_excess_event_id, created_by, created_at
  ) VALUES ('approved-b3', 'excess-account', 'b3', 'APPROVED_UTILIZATION', 'EUR',
    '10200', '10000', '200', '200', 'policy-1', null, 'b3-checker', '2026-09-23T00:20:00Z')`,
  ).run();
}

describe('BalanceService B4 Export Excess assets', () => {
  let db: Db;
  beforeEach(() => {
    db = createDb(':memory:');
  });
  afterEach(() => db.close());

  test.each([
    ['SIGHT', 'HONOUR', 'Due from Issuing Bank', 'EPLC_DUE_FROM_ISSUING_BANK:SIGHT'],
    ['SELLERS_USANCE', 'ACCEPT', 'Reimbursement Receivable', 'EPLC_ACCEPTANCE_REIMB_RECEIVABLE:USANCE'],
  ] as const)('atomically posts Covered and dedicated Excess assets for %s', (tenor, b4Type, coveredType, coveredMapping) => {
    seedB4(db, tenor, b4Type);
    const service = new BalanceService(db, () => '2026-09-23T01:00:00Z');

    const result = service.releaseB4ExportAssetsByChecker('b4', {
      checkerContext: 'b4-checker',
      decisionTime: '2026-09-23T01:00:00Z',
      authorization: {
        claimStatus: 'SUBMITTED',
        authorizationReference: 'AUTH-1',
        authorizedAmountOwner: '200',
        authorizedCurrency: 'EUR',
        authorizationValidationResult: 'CONFIRMED',
      },
    });

    expect(result.movement.status).toBe('RELEASED');
    expect(result.movement).toMatchObject({ amount: '10200', ceilingAmount: '10000', balanceBefore: '10000', balanceAfter: '0' });
    expect(result.authorization.excessDebtor).toBe('ISSUING_BANK');
    expect(result.assets.map((asset) => [asset.balanceType, asset.amountOwner, asset.mappingKey])).toEqual([
      [coveredType, '10000', coveredMapping],
      ['EXPORT_EXCESS_ASSET', '200', `EXPORT_EXCESS_ASSET:${tenor === 'SIGHT' ? 'SIGHT' : 'USANCE'}`],
    ]);
  });

  test('attributes the complete Excess to Recourse for a partial authorization and never writes a partial split', () => {
    seedB4(db, 'SIGHT', 'HONOUR');
    const result = new BalanceService(db).releaseB4ExportAssetsByChecker('b4', {
      checkerContext: 'b4-checker',
      decisionTime: '2026-09-23T01:00:00Z',
      authorization: {
        claimStatus: 'SUBMITTED',
        authorizationReference: 'AUTH-PARTIAL',
        authorizedAmountOwner: '150',
        authorizedCurrency: 'EUR',
        authorizationValidationResult: 'CONFIRMED',
      },
    });
    expect(result.assets[1]).toMatchObject({ amountOwner: '200', debtor: 'BENEFICIARY_OR_RECOURSE_PARTY' });
    expect(result.assets).toHaveLength(2);
  });

  test('rejects Checker == Maker with zero asset and authorization writes', () => {
    seedB4(db, 'SIGHT', 'HONOUR');
    const service = new BalanceService(db);
    expect(() =>
      service.releaseB4ExportAssetsByChecker('b4', {
        checkerContext: 'b4-maker',
        decisionTime: '2026-09-23T01:00:00Z',
        authorization: { claimStatus: 'ABSENT', authorizationValidationResult: 'NOT_CONFIRMED' },
      }),
    ).toThrow(MakerCheckerConflictError);
    expect(new ExportAssetStore(db).listPostingsByB4('b4')).toEqual([]);
    expect(db.prepare("SELECT status FROM balance_movements WHERE movement_id = 'b4'").get()).toEqual({ status: 'PENDING' });
  });

  test('HTTP rejects Checker == Maker as MAKER_CHECKER_CONFLICT without Recourse fallback', async () => {
    seedB4(db, 'SIGHT', 'HONOUR');
    const service = new BalanceService(db);
    const response = await request(createApp(db, service)).post('/balance-movements/b4/release').send({ releasedBy: 'b4-maker' }).expect(409);
    expect(response.body.code).toBe('MAKER_CHECKER_CONFLICT');
    expect(new ExportAssetStore(db).listPostingsByB4('b4')).toEqual([]);
    expect(new ExportAssetStore(db).findAuthorizationByB4('b4')).toBeUndefined();
    expect(db.prepare("SELECT status FROM balance_movements WHERE movement_id = 'b4'").get()).toEqual({ status: 'PENDING' });
  });

  test('rolls back authorization, both vouchers and movement release when the second asset insert fails', () => {
    seedB4(db, 'SIGHT', 'HONOUR');
    const service = new BalanceService(db);
    db.exec(`CREATE TRIGGER fail_export_excess_asset BEFORE INSERT ON export_asset_postings
      WHEN NEW.balance_type = 'EXPORT_EXCESS_ASSET' BEGIN SELECT RAISE(ABORT, 'forced asset failure'); END`);
    expect(() =>
      service.releaseB4ExportAssetsByChecker('b4', {
        checkerContext: 'b4-checker',
        decisionTime: '2026-09-23T01:00:00Z',
        authorization: { claimStatus: 'ABSENT', authorizationValidationResult: 'NOT_CONFIRMED' },
      }),
    ).toThrow('forced asset failure');
    expect(new ExportAssetStore(db).listPostingsByB4('b4')).toEqual([]);
    expect(new ExportAssetStore(db).findAuthorizationByB4('b4')).toBeUndefined();
    expect(db.prepare("SELECT status FROM balance_movements WHERE movement_id = 'b4'").get()).toEqual({ status: 'PENDING' });
  });

  test('generic release cannot bypass the B4 authorization and asset gate', () => {
    seedB4(db, 'SIGHT', 'HONOUR');
    expect(() => new BalanceService(db).release('b4', 'b4-checker')).toThrow(RequestValidationError);
    expect(db.prepare("SELECT status FROM balance_movements WHERE movement_id = 'b4'").get()).toEqual({ status: 'PENDING' });
  });

  test.each([
    ['invalid claim status', { claimStatus: 'UNKNOWN', authorizationValidationResult: 'NOT_CONFIRMED' }],
    ['invalid validation result', { claimStatus: 'SUBMITTED', authorizationValidationResult: 'UNKNOWN' }],
    ['non-object claim', 'SUBMITTED'],
  ])('HTTP rejects %s before B4 release writes', async (_label, exportAuthorization) => {
    seedB4(db, 'SIGHT', 'HONOUR');
    const service = new BalanceService(db);
    const response = await request(createApp(db, service))
      .post('/balance-movements/b4/release')
      .send({ releasedBy: 'b4-checker', exportAuthorization })
      .expect(400);
    expect(response.body.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(new ExportAssetStore(db).listPostingsByB4('b4')).toEqual([]);
    expect(db.prepare("SELECT status FROM balance_movements WHERE movement_id = 'b4'").get()).toEqual({ status: 'PENDING' });
  });

  test('B5 activity does not clear, merge, reclassify or rewrite the immutable B4 asset pair', () => {
    seedB4(db, 'SELLERS_USANCE', 'ACCEPT');
    const service = new BalanceService(db);
    service.releaseB4ExportAssetsByChecker('b4', {
      checkerContext: 'b4-checker',
      decisionTime: '2026-09-23T01:00:00Z',
      authorization: { claimStatus: 'ABSENT', authorizationValidationResult: 'NOT_CONFIRMED' },
    });
    const before = new ExportAssetStore(db).listPostingsByB4('b4');
    const acceptance = service.createMovement({
      instrumentType: 'EPLC_ACCEPTANCE',
      naturalKey: { lcNumber: 'EXP-1', ibNumber: 'B5-ACC-1' },
      parentLogicalContractId: 'confirmation-logical',
      movementType: 'CREATE',
      eventSeq: 1,
      amount: '100',
      currency: 'EUR',
      tenorType: 'SELLERS_USANCE',
      createdBy: 'acceptance-maker',
    });
    expect(acceptance.created).toBe(true);
    if (!acceptance.created) throw new Error('expected B5 Acceptance fixture');
    service.release(acceptance.movement.movementId, 'acceptance-checker');
    const b5 = service.createMovement({
      instrumentType: 'EPLC_ACCEPTANCE',
      balanceContractId: acceptance.movement.balanceContractId,
      movementType: 'REIMBURSE',
      eventSeq: 2,
      amount: '100',
      currency: 'EUR',
      createdBy: 'b5-maker',
    });
    expect(b5.created).toBe(true);
    if (b5.created) service.release(b5.movement.movementId, 'b5-checker');
    expect(new ExportAssetStore(db).listPostingsByB4('b4')).toEqual(before);
    expect(db.prepare("SELECT excess_amount_owner FROM excess_ledger_events WHERE excess_event_id = 'approved-b3'").get()).toEqual({
      excess_amount_owner: '200',
    });
  });
});
