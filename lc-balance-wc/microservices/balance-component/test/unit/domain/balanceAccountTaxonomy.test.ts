import rawTaxonomy from '../../../config/balance-account-mappings.json';
import { BALANCE_ACCOUNT_TAXONOMY, BalanceAccountTaxonomy } from '../../../src/config/balanceAccountTaxonomy';

describe('BalanceAccountTaxonomy', () => {
  it('defines two categories, five category-scoped Tenors, and five GL families', () => {
    expect(BALANCE_ACCOUNT_TAXONOMY.categories().map((item) => [item.categoryKey, item.tenorTypes.map((tenor) => tenor.tenorKey)])).toEqual([
      ['IMPORT', ['SIGHT', 'SELLERS_USANCE', 'BUYERS_USANCE']],
      ['EXPORT', ['SIGHT', 'USANCE']],
    ]);
    expect(BALANCE_ACCOUNT_TAXONOMY.categories().map((item) => item.label)).toEqual(['Import LC', 'Export Confirmed']);
    expect(BALANCE_ACCOUNT_TAXONOMY.families()).toHaveLength(5);
    expect(BALANCE_ACCOUNT_TAXONOMY.families().filter((item) => item.categoryKey === 'IMPORT').map((item) => item.familyKey)).toEqual([
      'IMPORT_LC_BALANCE',
      'SHIPPING_GUARANTEE_BALANCE',
      'IMPORT_ACCEPTANCE_BALANCE',
    ]);
  });

  it('keeps Import Sight and Export Sight in separate configuration domains', () => {
    expect(BALANCE_ACCOUNT_TAXONOMY.resolve('IPLC_LC', 'SIGHT')).toMatchObject({ categoryKey: 'IMPORT', tenorKey: 'SIGHT' });
    expect(BALANCE_ACCOUNT_TAXONOMY.resolve('EPLC_CONFIRMATION', 'SIGHT')).toMatchObject({ categoryKey: 'EXPORT', tenorKey: 'SIGHT' });
    expect(BALANCE_ACCOUNT_TAXONOMY.resolve('EPLC_CONFIRMATION', 'SELLERS_USANCE')).toMatchObject({ categoryKey: 'EXPORT', tenorKey: 'USANCE' });
  });

  it('publishes API Tenor values for shared request validation', () => {
    expect(BALANCE_ACCOUNT_TAXONOMY.tenorApiValues()).toEqual(['SIGHT', 'SELLERS_USANCE', 'BUYERS_USANCE']);
    expect(BALANCE_ACCOUNT_TAXONOMY.isTenorApiValue('BUYERS_USANCE')).toBe(true);
    expect(BALANCE_ACCOUNT_TAXONOMY.isTenorApiValue('NOT_CONFIGURED')).toBe(false);
  });

  it('rejects duplicate and unknown category-scoped configuration', () => {
    const duplicate = structuredClone(rawTaxonomy);
    duplicate.categories[0]!.tenorTypes.push({ ...duplicate.categories[0]!.tenorTypes[0]! });
    expect(() => new BalanceAccountTaxonomy(duplicate)).toThrow('Duplicate IMPORT tenorKey');

    const invalid = structuredClone(rawTaxonomy);
    invalid.families[0]!.tenorKeys.push('UNKNOWN');
    expect(() => new BalanceAccountTaxonomy(invalid)).toThrow('Unknown tenorKey IMPORT:UNKNOWN');
  });

  it.each([
    ['categoryKey', (value: typeof rawTaxonomy) => value.categories.push({ ...value.categories[0]!, tenorTypes: structuredClone(value.categories[0]!.tenorTypes) }), 'Duplicate categoryKey'],
    ['familyKey', (value: typeof rawTaxonomy) => value.families.push({ ...value.families[0]!, tenorKeys: [...value.families[0]!.tenorKeys] }), 'Duplicate familyKey'],
    ['family instrument', (value: typeof rawTaxonomy) => { value.families[1]!.instrumentType = value.families[0]!.instrumentType; }, 'Duplicate family instrumentType'],
    ['mappingKey', (value: typeof rawTaxonomy) => value.mappings.push(structuredClone(value.mappings[0]!)), 'Duplicate mappingKey'],
  ])('rejects duplicate %s values', (_label, mutate, message) => {
    const invalid = structuredClone(rawTaxonomy);
    mutate(invalid);
    expect(() => new BalanceAccountTaxonomy(invalid)).toThrow(message);
  });

  it('rejects duplicate API values and invalid family defaults', () => {
    const duplicateApiValue = structuredClone(rawTaxonomy);
    duplicateApiValue.categories[0]!.tenorTypes[1]!.apiValue = duplicateApiValue.categories[0]!.tenorTypes[0]!.apiValue;
    expect(() => new BalanceAccountTaxonomy(duplicateApiValue)).toThrow('Duplicate IMPORT tenor apiValue');

    const unknownCategory = structuredClone(rawTaxonomy);
    unknownCategory.families[0]!.categoryKey = 'UNKNOWN';
    expect(() => new BalanceAccountTaxonomy(unknownCategory)).toThrow('Unknown categoryKey UNKNOWN');

    const duplicateFamilyTenor = structuredClone(rawTaxonomy);
    duplicateFamilyTenor.families[0]!.tenorKeys.push(duplicateFamilyTenor.families[0]!.tenorKeys[0]!);
    expect(() => new BalanceAccountTaxonomy(duplicateFamilyTenor)).toThrow('Duplicate IMPORT_LC_BALANCE tenorKey');

    const invalidDefault = structuredClone(rawTaxonomy);
    invalidDefault.families[0]!.defaultTenorKey = 'BUYERS_USANCE';
    invalidDefault.families[0]!.tenorKeys = ['SIGHT'];
    expect(() => new BalanceAccountTaxonomy(invalidDefault)).toThrow('defaultTenorKey BUYERS_USANCE');
  });

  it('rejects invalid mapping routes, keys, and incomplete families', () => {
    const invalidRoute = structuredClone(rawTaxonomy);
    invalidRoute.mappings[0]!.familyKey = 'UNKNOWN';
    expect(() => new BalanceAccountTaxonomy(invalidRoute)).toThrow('Invalid family/Tenor route');

    const mismatchedInstrument = structuredClone(rawTaxonomy);
    mismatchedInstrument.mappings[0]!.instrumentType = 'OTHER';
    expect(() => new BalanceAccountTaxonomy(mismatchedInstrument)).toThrow('Invalid family/Tenor route');

    const mismatchedKey = structuredClone(rawTaxonomy);
    mismatchedKey.mappings[0]!.mappingKey = 'WRONG';
    expect(() => new BalanceAccountTaxonomy(mismatchedKey)).toThrow('must match instrumentType:riskClass');

    const missing = structuredClone(rawTaxonomy);
    missing.mappings.splice(0, 1);
    expect(() => new BalanceAccountTaxonomy(missing)).toThrow('must define exactly one mapping');
  });

  it('returns null for unknown or unsupported routes and exposes direct lookups', () => {
    expect(BALANCE_ACCOUNT_TAXONOMY.mapping('IPLC_LC:SIGHT')).toBeDefined();
    expect(BALANCE_ACCOUNT_TAXONOMY.mapping('UNKNOWN')).toBeUndefined();
    expect(BALANCE_ACCOUNT_TAXONOMY.family('IMPORT_LC_BALANCE')).toBeDefined();
    expect(BALANCE_ACCOUNT_TAXONOMY.family('UNKNOWN')).toBeUndefined();
    expect(BALANCE_ACCOUNT_TAXONOMY.resolve('UNKNOWN' as never, 'SIGHT')).toBeNull();
    expect(BALANCE_ACCOUNT_TAXONOMY.resolve('IPLC_LC', 'UNKNOWN' as never)).toBeNull();

    const noDefault = structuredClone(rawTaxonomy);
    delete noDefault.families[0]!.defaultTenorKey;
    const taxonomy = new BalanceAccountTaxonomy(noDefault);
    expect(taxonomy.resolve('IPLC_LC', null)).toBeNull();
  });
});
