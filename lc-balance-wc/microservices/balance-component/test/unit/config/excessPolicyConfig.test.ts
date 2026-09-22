import { loadExcessPolicyConfig, resolveExcessPolicy } from '../../../src/config/excessPolicyConfig';

const valid = [
  {
    policyVersion: 'v11.15-2026-09-22',
    ownerType: 'IMPORT_LC',
    allowancePercentage: '10',
    configuredMaximumUsd: '150000',
    fxMaxStalenessSeconds: 300,
    currencyPrecisions: { USD: 2, EUR: 2, JPY: 0 },
    rateScale: 6,
    roundingMode: 'ROUND_HALF_UP',
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
    currencyPrecisions: { USD: 2, EUR: 2 },
    rateScale: 6,
    roundingMode: 'ROUND_HALF_UP',
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
    expect(result[0]).toMatchObject({ currencyPrecisions: { USD: 2, JPY: 0 }, rateScale: 6, roundingMode: 'ROUND_HALF_UP' });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
  });

  test('rejects overlapping intervals for the same owner type', () => {
    const overlapping = [
      { ...valid[0], effectiveTo: '2026-12-31T23:59:59.999Z' },
      { ...valid[0], policyVersion: 'v11.15-overlap', effectiveFrom: '2026-12-01T00:00:00.000Z' },
      valid[1],
    ];
    expect(() => loadExcessPolicyConfig(JSON.stringify(overlapping))).toThrow(/overlapping/i);
  });

  test('rejects any fallback policy other than FAIL_CLOSED', () => {
    expect(() => loadExcessPolicyConfig(JSON.stringify([{ ...valid[0], fallbackPolicy: 'MIDPOINT' }]))).toThrow(/FAIL_CLOSED/);
  });

  test('rejects malformed JSON', () => {
    expect(() => loadExcessPolicyConfig('{')).toThrow('must be valid JSON');
  });

  test('rejects an interval whose end is not after its start', () => {
    expect(() => loadExcessPolicyConfig(JSON.stringify([{ ...valid[0], effectiveTo: valid[0]!.effectiveFrom }, valid[1]]))).toThrow(
      /effectiveTo must be after effectiveFrom/,
    );
  });

  test('rejects currency precision without USD and unsupported rounding metadata', () => {
    expect(() => loadExcessPolicyConfig(JSON.stringify([{ ...valid[0], currencyPrecisions: { EUR: 2 } }, valid[1]]))).toThrow(/USD/);
    expect(() => loadExcessPolicyConfig(JSON.stringify([{ ...valid[0], roundingMode: 'ROUND_DOWN' }, valid[1]]))).toThrow(/ROUND_HALF_UP/);
  });

  test('requires both approved allowance owner types', () => {
    expect(() => loadExcessPolicyConfig(JSON.stringify([valid[0]]))).toThrow(/EXPORT_CONFIRMATION/);
  });

  test('rejects reuse of a policy version within the same owner history', () => {
    const reusedVersion = [{ ...valid[0], effectiveTo: '2026-10-01T00:00:00.000Z' }, { ...valid[0], effectiveFrom: '2026-10-01T00:00:00.000Z' }, valid[1]];
    expect(() => loadExcessPolicyConfig(JSON.stringify(reusedVersion))).toThrow(/policyVersion.*unique/i);
  });

  test.each([
    ['negative allowance', { ...valid[0], allowancePercentage: '-1' }],
    ['negative cap', { ...valid[0], configuredMaximumUsd: '-1' }],
    ['zero freshness', { ...valid[0], fxMaxStalenessSeconds: 0 }],
  ])('rejects %s', (_label, item) => {
    expect(() => loadExcessPolicyConfig(JSON.stringify([item, valid[1]]))).toThrow();
  });

  test('resolves the single policy in a half-open effective interval', () => {
    const policies = loadExcessPolicyConfig(JSON.stringify(valid));
    expect(resolveExcessPolicy(policies, 'IMPORT_LC', '2026-09-22T00:00:00.000Z').policyVersion).toBe('v11.15-2026-09-22');
  });

  test('rejects invalid decision time or a missing effective policy', () => {
    const policies = loadExcessPolicyConfig(JSON.stringify(valid));
    expect(() => resolveExcessPolicy(policies, 'IMPORT_LC', 'not-a-date')).toThrow(/decisionTime/);
    expect(() => resolveExcessPolicy(policies, 'IMPORT_LC', '2025-01-01T00:00:00.000Z')).toThrow(/found 0/);
  });
});
