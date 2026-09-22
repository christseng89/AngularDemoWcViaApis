import { loadExcessPolicyConfig } from '../../../src/config/excessPolicyConfig';

const valid = [
  {
    policyVersion: 'v11.15-2026-09-22',
    ownerType: 'IMPORT_LC',
    allowancePercentage: '10',
    configuredMaximumUsd: '150000',
    fxMaxStalenessSeconds: 300,
    effectiveFrom: '2026-09-22T00:00:00.000Z',
    effectiveTo: null,
    fallbackPolicy: 'FAIL_CLOSED',
  },
  {
    policyVersion: 'v11.15-2026-09-22',
    ownerType: 'EXPORT_CONFIRMATION',
    allowancePercentage: '8',
    configuredMaximumUsd: '100000',
    fxMaxStalenessSeconds: 300,
    effectiveFrom: '2026-09-22T00:00:00.000Z',
    effectiveTo: null,
    fallbackPolicy: 'FAIL_CLOSED',
  },
];

describe('loadExcessPolicyConfig', () => {
  test('loads immutable, effective-dated import and export policies', () => {
    const result = loadExcessPolicyConfig(JSON.stringify(valid));
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ ownerType: 'IMPORT_LC', fallbackPolicy: 'FAIL_CLOSED' });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
  });

  test('rejects overlapping intervals for the same owner type', () => {
    const overlapping = [
      { ...valid[0], effectiveTo: '2026-12-31T23:59:59.999Z' },
      { ...valid[0], policyVersion: 'v11.15-overlap', effectiveFrom: '2026-12-01T00:00:00.000Z' },
    ];
    expect(() => loadExcessPolicyConfig(JSON.stringify(overlapping))).toThrow(/overlapping/i);
  });

  test('rejects any fallback policy other than FAIL_CLOSED', () => {
    expect(() => loadExcessPolicyConfig(JSON.stringify([{ ...valid[0], fallbackPolicy: 'MIDPOINT' }]))).toThrow(/FAIL_CLOSED/);
  });

  test.each([
    ['negative allowance', { ...valid[0], allowancePercentage: '-1' }],
    ['negative cap', { ...valid[0], configuredMaximumUsd: '-1' }],
    ['zero freshness', { ...valid[0], fxMaxStalenessSeconds: 0 }],
  ])('rejects %s', (_label, item) => {
    expect(() => loadExcessPolicyConfig(JSON.stringify([item]))).toThrow();
  });
});
