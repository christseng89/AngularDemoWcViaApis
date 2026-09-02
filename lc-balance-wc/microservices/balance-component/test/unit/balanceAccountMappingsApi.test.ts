import request from 'supertest';
import { createApp } from '../../src/app';
import { loadBalanceAccountNumberConfig } from '../../src/config';
import { createDb } from '../../src/db';
import { BalanceAccountMappingService } from '../../src/service/balanceAccountMappingService';

describe('Balance Account Number maintenance API', () => {
  test('lists all 11 fixed product/risk account sets and validation metadata', async () => {
    const db = createDb(':memory:');
    const response = await request(createApp(db)).get('/balance-account-mappings').expect(200);
    expect(response.body.items).toHaveLength(11);
    expect(response.body.items.map((item: { mappingKey: string }) => item.mappingKey)).toContain('SHGT:SELLERS_USANCE');
    expect(response.body.validation).toEqual({ pattern: '^.+$', minLength: 1, maxLength: 128 });
    db.close();
  });

  test('updates exactly one complete two-account set and rejects a stale version', async () => {
    const db = createDb(':memory:');
    const app = createApp(db);
    const body = {
      expectedVersion: 1,
      updatedBy: 'demo-user',
      accountA: { accountNumber: 'GL-911001', accountDescription: 'Sight customer liability' },
      accountB: { accountNumber: 'GL-921001', accountDescription: 'Sight outstanding' },
    };
    const saved = await request(app).put('/balance-account-mappings/IPLC_LC%3ASIGHT').send(body).expect(200);
    expect(saved.body).toMatchObject({ mappingKey: 'IPLC_LC:SIGHT', version: 2, updatedBy: 'demo-user', accountA: body.accountA, accountB: body.accountB });

    const conflict = await request(app).put('/balance-account-mappings/IPLC_LC%3ASIGHT').send(body).expect(409);
    expect(conflict.body.code).toBe('ACCOUNT_MAPPING_VERSION_CONFLICT');
    db.close();
  });

  test('enforces regex and supports fixed length when MIN equals MAX', () => {
    const db = createDb(':memory:');
    const config = loadBalanceAccountNumberConfig({
      BALANCE_ACCOUNT_NUMBER_REGEX: '^[0-9]+$',
      BALANCE_ACCOUNT_NUMBER_MIN_LEN: '4',
      BALANCE_ACCOUNT_NUMBER_MAX_LEN: '4',
    });
    const service = new BalanceAccountMappingService(db, config);
    expect(() =>
      service.update({
        mappingKey: 'IPLC_LC:SIGHT', expectedVersion: 1, updatedBy: 'demo-user',
        accountA: { accountNumber: '123', accountDescription: 'A' },
        accountB: { accountNumber: '5678', accountDescription: 'B' },
      }),
    ).toThrow('exactly 4');
    expect(() => loadBalanceAccountNumberConfig({ BALANCE_ACCOUNT_NUMBER_MIN_LEN: '5', BALANCE_ACCOUNT_NUMBER_MAX_LEN: '4' })).toThrow('must not exceed');
    db.close();
  });

  test('new movements snapshot the latest mapping while historical vouchers stay unchanged', async () => {
    const db = createDb(':memory:');
    const app = createApp(db);
    const oldMovement = await request(app).post('/balance-movements').send({
      instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'MAP-OLD' }, movementType: 'ISSUE',
      expiryDate: '2099-12-31', eventSeq: 1, amount: '1000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1',
    }).expect(201);

    await request(app).put('/balance-account-mappings/IPLC_LC%3ASIGHT').send({
      expectedVersion: 1,
      updatedBy: 'demo-user',
      accountA: { accountNumber: 'GL-110001', accountDescription: 'Customer liability' },
      accountB: { accountNumber: 'GL-210001', accountDescription: 'Outstanding LC' },
    }).expect(200);
    const newMovement = await request(app).post('/balance-movements').send({
      instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'MAP-NEW' }, movementType: 'ISSUE',
      expiryDate: '2099-12-31', eventSeq: 1, amount: '2000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1',
    }).expect(201);

    expect(newMovement.body.contingentAccountEntry).toMatchObject({
      drAccountNumber: 'GL-110001', drAccountDescription: 'Customer liability',
      crAccountNumber: 'GL-210001', crAccountDescription: 'Outstanding LC',
      accountMappingKey: 'IPLC_LC:SIGHT', accountMappingVersion: 2,
    });
    const oldTimeline = await request(app).get(`/balance-contracts/${oldMovement.body.balanceContractId}/movements`).expect(200);
    expect(oldTimeline.body[0].contingentAccountEntry).toMatchObject({
      drAccountNumber: "Customers' Liability under DC — Sight",
      accountMappingVersion: 1,
    });
    db.close();
  });
});
