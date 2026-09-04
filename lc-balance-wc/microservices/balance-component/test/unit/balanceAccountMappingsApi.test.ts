import request from 'supertest';
import { createApp } from '../../src/app';
import { loadBalanceAccountNumberConfig } from '../../src/config';
import { createDb } from '../../src/db';
import { BalanceAccountMappingService } from '../../src/service/balanceAccountMappingService';

describe('Balance Account Number maintenance API', () => {
  test('lists configured mappings under the same Import LC / Export Confirmed categories used by transactions', async () => {
    const db = createDb(':memory:');
    const response = await request(createApp(db)).get('/balance-account-mappings').expect(200);
    expect(response.body.items).toHaveLength(11);
    expect(response.body.items.map((item: { mappingKey: string }) => item.mappingKey)).toContain('SHGT:SELLERS_USANCE');
    expect(response.body.categories.map((item: { categoryKey: string; label: string }) => [item.categoryKey, item.label])).toEqual([
      ['IMPORT', 'Import LC'],
      ['EXPORT', 'Export Confirmed'],
    ]);
    expect(response.body.categories.flatMap((item: { families: unknown[] }) => item.families)).toHaveLength(5);
    expect(response.body.categories[0].tenorTypes.map((item: { tenorKey: string }) => item.tenorKey)).toEqual(['SIGHT', 'SELLERS_USANCE', 'BUYERS_USANCE']);
    expect(response.body.categories[1].tenorTypes.map((item: { tenorKey: string }) => item.tenorKey)).toEqual(['SIGHT', 'USANCE']);
    expect(response.body.validation).toEqual({ pattern: '^.+$', minLength: 1, maxLength: 128 });
    db.close();
  });

  test('reloads every Account Number mapping from configuration in one request', async () => {
    const db = createDb(':memory:');
    const app = createApp(db);
    await request(app).put('/balance-account-mappings/IPLC_LC%3ASIGHT').send({
      expectedVersion: 1,
      updatedBy: 'operator',
      accountA: { accountNumber: 'TEMP-A', accountDescription: 'Temporary A' },
      accountB: { accountNumber: 'TEMP-B', accountDescription: 'Temporary B' },
    }).expect(200);

    const response = await request(app).post('/balance-account-mappings/reload-configuration').send({}).expect(200);
    expect(response.body.items).toHaveLength(11);
    expect(response.body.items.every((item: { version: number; updatedBy: string }) => item.version === 1 && item.updatedBy === 'SYSTEM_CONFIG_RELOAD')).toBe(true);
    expect(response.body.items.find((item: { mappingKey: string }) => item.mappingKey === 'IPLC_LC:SIGHT')).toMatchObject({
      accountA: { accountNumber: 'Customer Liability for DC — Sight', accountDescription: 'Customer Liability for DC — Sight' },
      accountB: { accountNumber: 'DC Liability — Sight', accountDescription: 'DC Liability — Sight' },
    });
    db.close();
  });

  test('rolls back every configuration mapping when one reload write fails', async () => {
    const db = createDb(':memory:');
    const app = createApp(db);
    await request(app).put('/balance-account-mappings/IPLC_LC%3ASIGHT').send({
      expectedVersion: 1,
      updatedBy: 'operator',
      accountA: { accountNumber: 'KEEP-A', accountDescription: 'Keep A' },
      accountB: { accountNumber: 'KEEP-B', accountDescription: 'Keep B' },
    }).expect(200);
    db.exec(`CREATE TRIGGER force_configuration_reload_failure
      BEFORE UPDATE ON balance_account_mappings
      WHEN NEW.mapping_key = 'IPLC_LC:SELLERS_USANCE' AND NEW.updated_by = 'SYSTEM_CONFIG_RELOAD'
      BEGIN SELECT RAISE(ABORT, 'forced reload failure'); END`);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await request(app).post('/balance-account-mappings/reload-configuration').send({}).expect(500);
    consoleError.mockRestore();

    const after = await request(app).get('/balance-account-mappings').expect(200);
    expect(after.body.items.find((item: { mappingKey: string }) => item.mappingKey === 'IPLC_LC:SIGHT')).toMatchObject({
      accountA: { accountNumber: 'KEEP-A' }, accountB: { accountNumber: 'KEEP-B' }, version: 2, updatedBy: 'operator',
    });
    db.close();
  });

  test('updates every configured SL in one family atomically while preserving distinct account identities', async () => {
    const db = createDb(':memory:');
    const app = createApp(db);
    const listed = await request(app).get('/balance-account-mappings').expect(200);
    const family = listed.body.categories[0].families.find((item: { familyKey: string }) => item.familyKey === 'IMPORT_LC_BALANCE');
    const mappings = family.mappings.map((item: { mappingKey: string; version: number }, index: number) => ({
      mappingKey: item.mappingKey,
      expectedVersion: item.version,
      accountA: { accountNumber: `GL-A-${index}`, accountDescription: `A SL ${index}` },
      accountB: { accountNumber: `GL-B-${index}`, accountDescription: `B SL ${index}` },
    }));
    const saved = await request(app).put('/balance-account-mappings/families/IMPORT_LC_BALANCE').send({ updatedBy: 'ops-user', mappings }).expect(200);
    expect(saved.body.mappings.map((item: { accountA: { accountNumber: string } }) => item.accountA.accountNumber)).toEqual(['GL-A-0', 'GL-A-1', 'GL-A-2']);
    expect(saved.body.mappings.every((item: { version: number }) => item.version === 2)).toBe(true);

    const stale = mappings.map((item: { expectedVersion: number }, index: number) => ({ ...item, expectedVersion: index === 1 ? 2 : item.expectedVersion }));
    await request(app).put('/balance-account-mappings/families/IMPORT_LC_BALANCE').send({ updatedBy: 'other-user', mappings: stale }).expect(409);
    const afterConflict = await request(app).get('/balance-account-mappings').expect(200);
    const afterFamily = afterConflict.body.categories[0].families.find((item: { familyKey: string }) => item.familyKey === 'IMPORT_LC_BALANCE');
    expect(afterFamily.mappings.every((item: { version: number; updatedBy: string }) => item.version === 2 && item.updatedBy === 'ops-user')).toBe(true);
    db.close();
  });

  test('rejects incomplete or duplicate family payloads', async () => {
    const db = createDb(':memory:');
    const app = createApp(db);
    const listed = await request(app).get('/balance-account-mappings').expect(200);
    const mapping = listed.body.categories[0].families[0].mappings[0];
    const row = { mappingKey: mapping.mappingKey, expectedVersion: mapping.version, accountA: mapping.accountA, accountB: mapping.accountB };
    await request(app).put('/balance-account-mappings/families/IMPORT_LC_BALANCE').send({ updatedBy: 'ops-user', mappings: [row] }).expect(400);
    await request(app).put('/balance-account-mappings/families/UNKNOWN').send({ updatedBy: 'ops-user', mappings: [row] }).expect(404);
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
    expect(service.findFor('UNKNOWN' as never, 'SIGHT')).toBeUndefined();
    expect(() => service.update({
      mappingKey: 'UNKNOWN', expectedVersion: 1, updatedBy: 'demo-user',
      accountA: { accountNumber: '1234', accountDescription: 'A' },
      accountB: { accountNumber: '5678', accountDescription: 'B' },
    })).toThrow('No balance account mapping UNKNOWN');
    expect(() => service.update({
      mappingKey: 'IPLC_LC:SIGHT', expectedVersion: 1, updatedBy: 'demo-user',
      accountA: { accountNumber: '12X4', accountDescription: 'A' },
      accountB: { accountNumber: '5678', accountDescription: 'B' },
    })).toThrow('does not match BALANCE_ACCOUNT_NUMBER_REGEX');
    expect(() => service.update({
      mappingKey: 'IPLC_LC:SIGHT', expectedVersion: 1, updatedBy: 'demo-user',
      accountA: { accountNumber: '1234', accountDescription: ' ' },
      accountB: { accountNumber: '5678', accountDescription: 'B' },
    })).toThrow('accountDescription must contain 1-200 characters');

    const family = service.list().categories[0]!.families.find((item) => item.familyKey === 'IMPORT_LC_BALANCE')!;
    const familyRows = family.mappings.map((item) => ({
      mappingKey: item.mappingKey, expectedVersion: item.version, accountA: item.accountA, accountB: item.accountB,
    }));
    expect(() => service.updateFamily({ familyKey: family.familyKey, updatedBy: ' ', mappings: familyRows })).toThrow('updatedBy is required');
    expect(() => service.updateFamily({ familyKey: family.familyKey, updatedBy: 'ops', mappings: [familyRows[0]!, familyRows[0]!, familyRows[2]!] })).toThrow('exactly once');
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
      drAccountNumber: 'Customer Liability for DC — Sight',
      accountMappingVersion: 1,
    });
    db.close();
  });
});
