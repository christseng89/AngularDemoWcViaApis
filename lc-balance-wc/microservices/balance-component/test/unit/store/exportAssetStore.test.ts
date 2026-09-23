import { createDb, type Db } from '../../../src/db';
import { ExportAssetStore } from '../../../src/store/exportAssetStore';
import { BalanceAccountMappingService } from '../../../src/service/balanceAccountMappingService';

function seedMovements(db: Db): void {
  db.prepare(
    `INSERT INTO balance_contracts (
    balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number,
    status, currency, opening_balance, effective_from, created_by, created_at
  ) VALUES (?, ?, 1, ?, ?, 'ACTIVE', 'EUR', '10200', '2026-09-23', 'maker', '2026-09-23T00:00:00Z')`,
  ).run('confirmation', 'confirmation-logical', 'EPLC_CONFIRMATION', 'EXP-1');
  db.prepare(
    `INSERT INTO balance_contracts (
    balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number,
    parent_logical_contract_id, status, currency, opening_balance, effective_from, created_by, created_at
  ) VALUES (?, ?, 1, ?, ?, ?, 'ACTIVE', 'EUR', '10200', '2026-09-23', 'maker', '2026-09-23T00:00:00Z')`,
  ).run('exam', 'exam-logical', 'EPLC_EXAMINATION', 'EXP-1', 'confirmation-logical');
  const insertMovement = db.prepare(`INSERT INTO balance_movements (
    movement_id, balance_contract_id, event_seq, movement_type, exposure_nature, amount,
    ceiling_amount, currency, status, created_by, created_at, referenced_transaction_id
  ) VALUES (?, ?, ?, ?, 'CONTINGENT', '10200', '10200', 'EUR', ?, ?, '2026-09-23T00:00:00Z', ?)`);
  insertMovement.run('b3', 'exam', 1, 'CREATE', 'RELEASED', 'b3-maker', null);
  insertMovement.run('b4', 'confirmation', 2, 'HONOUR', 'PENDING', 'b4-maker', 'b3');
}

describe('Export Asset append-only persistence', () => {
  let db: Db;
  beforeEach(() => {
    db = createDb(':memory:');
    new BalanceAccountMappingService(db);
    seedMovements(db);
  });
  afterEach(() => db.close());

  test('persists one authorization snapshot and two separately mapped asset legs', () => {
    const store = new ExportAssetStore(db);
    store.insertAuthorization({
      authorizationSnapshotId: 'auth-1',
      b4MovementId: 'b4',
      sourceB3MovementId: 'b3',
      claimStatus: 'SUBMITTED',
      authorizationReference: 'AUTH-1',
      authorizedAmountOwner: '200',
      authorizedCurrency: 'EUR',
      authorizationValidationResult: 'CONFIRMED',
      checkerContext: 'checker',
      decisionTime: '2026-09-23T00:59:00Z',
      confirmedAt: '2026-09-23T01:00:00Z',
      excessDebtor: 'ISSUING_BANK',
      createdAt: '2026-09-23T01:00:00Z',
    });
    for (const [postingId, balanceType, amount, mappingKey] of [
      ['posting-covered', 'Due from Issuing Bank', '10000', 'EPLC_DUE_FROM_ISSUING_BANK:SIGHT'],
      ['posting-excess', 'EXPORT_EXCESS_ASSET', '200', 'EXPORT_EXCESS_ASSET:SIGHT'],
    ] as const) {
      store.insertPosting({
        postingId,
        businessEventId: 'event-b4',
        b4MovementId: 'b4',
        sourceB3MovementId: 'b3',
        balanceType,
        amountOwner: amount,
        ownerCurrency: 'EUR',
        debtor: 'ISSUING_BANK',
        mappingKey,
        mappingVersion: 1,
        accountANumber: `A-${postingId}`,
        accountBNumber: `B-${postingId}`,
        authorizationSnapshotId: 'auth-1',
        createdAt: '2026-09-23T01:00:00Z',
      });
    }

    expect(store.findAuthorizationByB4('b4')).toMatchObject({ claimStatus: 'SUBMITTED', excessDebtor: 'ISSUING_BANK' });
    expect(store.listPostingsByB4('b4').map((row) => [row.balanceType, row.amountOwner, row.mappingKey])).toEqual([
      ['Due from Issuing Bank', '10000', 'EPLC_DUE_FROM_ISSUING_BANK:SIGHT'],
      ['EXPORT_EXCESS_ASSET', '200', 'EXPORT_EXCESS_ASSET:SIGHT'],
    ]);
  });

  test.each(['export_authorization_snapshots', 'export_asset_postings'])('%s is immutable', (table) => {
    const store = new ExportAssetStore(db);
    store.insertAuthorization({
      authorizationSnapshotId: 'auth-immut',
      b4MovementId: 'b4',
      sourceB3MovementId: 'b3',
      claimStatus: 'ABSENT',
      authorizationValidationResult: 'NOT_CONFIRMED',
      checkerContext: 'checker',
      decisionTime: '2026-09-23T00:59:00Z',
      confirmedAt: '2026-09-23T01:00:00Z',
      excessDebtor: 'BENEFICIARY_OR_RECOURSE_PARTY',
      createdAt: '2026-09-23T01:00:00Z',
    });
    if (table === 'export_asset_postings') {
      store.insertPosting({
        postingId: 'posting-immut',
        businessEventId: 'event-b4',
        b4MovementId: 'b4',
        sourceB3MovementId: 'b3',
        balanceType: 'EXPORT_EXCESS_ASSET',
        amountOwner: '200',
        ownerCurrency: 'EUR',
        debtor: 'BENEFICIARY_OR_RECOURSE_PARTY',
        mappingKey: 'EXPORT_EXCESS_ASSET:SIGHT',
        mappingVersion: 1,
        accountANumber: 'A',
        accountBNumber: 'B',
        authorizationSnapshotId: 'auth-immut',
        createdAt: '2026-09-23T01:00:00Z',
      });
    }
    expect(() => db.exec(`UPDATE ${table} SET created_at = 'changed'`)).toThrow(/append-only/);
    expect(() => db.exec(`DELETE FROM ${table}`)).toThrow(/append-only/);
  });
});
