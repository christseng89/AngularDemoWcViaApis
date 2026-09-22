import {
  computeCoveredAndExcess,
  computeEffectiveAllowanceLimitUsd,
  evaluateExcessAllowance,
  selectExcessProcessingRoute,
} from '../../../src/domain/excessPolicy';

describe('unified excess policy (v11.15)', () => {
  describe('selectExcessProcessingRoute (BD-03)', () => {
    test.each([
      { configuredMaximumUsd: '0', allowancePercentage: '0' },
      { configuredMaximumUsd: '0', allowancePercentage: '10' },
      { configuredMaximumUsd: '150000', allowancePercentage: '0' },
    ])('routes $configuredMaximumUsd / $allowancePercentage to legacy sufficiency', (policy) => {
      expect(selectExcessProcessingRoute(policy)).toBe('LEGACY_SUFFICIENCY');
    });

    test('enables Excess only when both values are strictly positive', () => {
      expect(selectExcessProcessingRoute({ configuredMaximumUsd: '0.01', allowancePercentage: '0.01' })).toBe('EXCESS_FRAMEWORK');
    });

    test.each([
      { configuredMaximumUsd: '-0.01', allowancePercentage: '10' },
      { configuredMaximumUsd: '100', allowancePercentage: '-0.01' },
      { configuredMaximumUsd: 'invalid', allowancePercentage: '10' },
    ])('rejects invalid policy values before routing: %#', (policy) => {
      expect(() => selectExcessProcessingRoute(policy)).toThrow();
    });
  });

  describe('computeCoveredAndExcess', () => {
    test.each([
      { amount: '120', capacity: '100', covered: '100', excess: '20' },
      { amount: '80', capacity: '100', covered: '80', excess: '0' },
      { amount: '120', capacity: '-5', covered: '0', excess: '120' },
      { amount: '0', capacity: '100', covered: '0', excess: '0' },
    ])('splits $amount against $capacity without allowing negative covered capacity', ({ amount, capacity, covered, excess }) => {
      expect(computeCoveredAndExcess({ transactionAmount: amount, effectiveCapacity: capacity })).toEqual({
        coveredAmount: covered,
        excessAmount: excess,
      });
    });

    test('rejects a negative transaction amount', () => {
      expect(() => computeCoveredAndExcess({ transactionAmount: '-0.01', effectiveCapacity: '100' })).toThrow('transactionAmount must be non-negative');
    });
  });

  describe('computeEffectiveAllowanceLimitUsd', () => {
    test('uses contractual maximum × percentage when that is below the USD cap', () => {
      expect(
        computeEffectiveAllowanceLimitUsd({
          contractualMaximumUsd: '1000000',
          allowancePercentage: '10',
          configuredMaximumUsd: '150000',
        }),
      ).toBe('100000');
    });

    test('caps the percentage allowance at the configured USD maximum', () => {
      expect(
        computeEffectiveAllowanceLimitUsd({
          contractualMaximumUsd: '1000000',
          allowancePercentage: '20',
          configuredMaximumUsd: '150000',
        }),
      ).toBe('150000');
    });
  });

  describe('evaluateExcessAllowance', () => {
    test('accepts the exact-limit boundary and returns zero remaining allowance', () => {
      expect(
        evaluateExcessAllowance({
          effectiveLimitUsd: '100',
          approvedUtilizedUsd: '60',
          otherPendingReservedUsd: '30',
          proposedExcessUsd: '10',
        }),
      ).toEqual({ decision: 'WITHIN_ALLOWANCE', availableAllowanceUsd: '10', remainingAllowanceUsd: '0' });
    });

    test('rejects one cent over the limit without producing a negative available allowance', () => {
      expect(
        evaluateExcessAllowance({
          effectiveLimitUsd: '100',
          approvedUtilizedUsd: '60',
          otherPendingReservedUsd: '30',
          proposedExcessUsd: '10.01',
        }),
      ).toEqual({ decision: 'LIMIT_EXCEEDED', availableAllowanceUsd: '10', remainingAllowanceUsd: '10' });
    });

    test('reports NOT_REQUIRED for zero proposed excess', () => {
      expect(
        evaluateExcessAllowance({
          effectiveLimitUsd: '100',
          approvedUtilizedUsd: '100',
          otherPendingReservedUsd: '0',
          proposedExcessUsd: '0',
        }),
      ).toEqual({ decision: 'NOT_REQUIRED', availableAllowanceUsd: '0', remainingAllowanceUsd: '0' });
    });
  });
});
