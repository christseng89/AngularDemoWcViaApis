import {
  computeCoveredAndExcess,
  computeEffectiveAllowanceLimitOwner,
  evaluateOwnerExcessAllowance,
  selectExcessProcessingRoute,
} from '../../../src/domain/excessPolicy';

describe('unified excess policy (V4)', () => {
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
      { configuredMaximumUsd: '100', allowancePercentage: 'invalid' },
    ])('rejects invalid policy values before routing: %#', (policy) => {
      expect(() => selectExcessProcessingRoute(policy)).toThrow();
    });
  });

  describe('computeCoveredAndExcess', () => {
    test.each([
      { amount: '120', capacity: '100', covered: '100', excess: '20' },
      { amount: '80', capacity: '100', covered: '80', excess: '0' },
      { amount: '120', capacity: '0', covered: '0', excess: '120' },
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

  describe('computeEffectiveAllowanceLimitOwner', () => {
    test('uses owner-currency contractual maximum × percentage when below the provider-converted owner cap', () => {
      expect(
        computeEffectiveAllowanceLimitOwner({
          approvedContractualMaximumOwner: '1000000',
          allowancePercentage: '10',
          configuredMaximumOwner: '150000',
          ownerCurrencyPrecision: 2,
        }),
      ).toBe('100000');
    });

    test('caps the percentage allowance at provider convertedAmount in owner currency', () => {
      expect(
        computeEffectiveAllowanceLimitOwner({
          approvedContractualMaximumOwner: '1000000',
          allowancePercentage: '20',
          configuredMaximumOwner: '150000',
          ownerCurrencyPrecision: 2,
        }),
      ).toBe('150000');
    });

    test.each([
      { currency: 'EUR', maximum: '1000.05', percentage: '10', cap: '999999', precision: 2, expected: '100.01' },
      { currency: 'JPY', maximum: '1005', percentage: '10', cap: '999999', precision: 0, expected: '101' },
      { currency: 'KWD', maximum: '10.005', percentage: '10', cap: '999999', precision: 3, expected: '1.001' },
    ])('rounds the $currency percentage allowance once with owner minor-unit ROUND_HALF_UP', ({ maximum, percentage, cap, precision, expected }) => {
      expect(
        computeEffectiveAllowanceLimitOwner({
          approvedContractualMaximumOwner: maximum,
          allowancePercentage: percentage,
          configuredMaximumOwner: cap,
          ownerCurrencyPrecision: precision,
        }),
      ).toBe(expected);
    });

    test.each([-1, 4, 1.5])('rejects unsupported owner currency precision %s', (ownerCurrencyPrecision) => {
      expect(() =>
        computeEffectiveAllowanceLimitOwner({
          approvedContractualMaximumOwner: '100',
          allowancePercentage: '10',
          configuredMaximumOwner: '100',
          ownerCurrencyPrecision,
        }),
      ).toThrow(/ownerCurrencyPrecision/);
    });
  });

  describe('evaluateOwnerExcessAllowance', () => {
    test('accepts the exact-limit boundary and returns zero remaining allowance', () => {
      expect(
        evaluateOwnerExcessAllowance({
          effectiveLimitOwner: '100',
          approvedUtilizedOwner: '60',
          otherPendingReservedOwner: '30',
          proposedExcessOwner: '10',
          ownerCurrencyPrecision: 2,
        }),
      ).toEqual({ decision: 'WITHIN_ALLOWANCE', availableAllowanceOwner: '10', remainingAllowanceOwner: '0' });
    });

    test.each([
      { currency: 'EUR', precision: 2, proposed: '10.01' },
      { currency: 'JPY', precision: 0, proposed: '11' },
      { currency: 'KWD', precision: 3, proposed: '10.001' },
    ])('rejects one $currency minor unit over the limit without producing negative availability', ({ precision, proposed }) => {
      expect(
        evaluateOwnerExcessAllowance({
          effectiveLimitOwner: '100',
          approvedUtilizedOwner: '60',
          otherPendingReservedOwner: '30',
          proposedExcessOwner: proposed,
          ownerCurrencyPrecision: precision,
        }),
      ).toEqual({ decision: 'LIMIT_EXCEEDED', availableAllowanceOwner: '10', remainingAllowanceOwner: '10' });
    });

    test('reports NOT_REQUIRED for zero proposed excess', () => {
      expect(
        evaluateOwnerExcessAllowance({
          effectiveLimitOwner: '100',
          approvedUtilizedOwner: '100',
          otherPendingReservedOwner: '0',
          proposedExcessOwner: '0',
          ownerCurrencyPrecision: 2,
        }),
      ).toEqual({ decision: 'NOT_REQUIRED', availableAllowanceOwner: '0', remainingAllowanceOwner: '0' });
    });

    test('rejects a competing reservation after another Maker has consumed the remaining aggregate', () => {
      const first = evaluateOwnerExcessAllowance({
        effectiveLimitOwner: '100',
        approvedUtilizedOwner: '60',
        otherPendingReservedOwner: '30',
        proposedExcessOwner: '10',
        ownerCurrencyPrecision: 2,
      });
      expect(first).toEqual({ decision: 'WITHIN_ALLOWANCE', availableAllowanceOwner: '10', remainingAllowanceOwner: '0' });

      expect(
        evaluateOwnerExcessAllowance({
          effectiveLimitOwner: '100',
          approvedUtilizedOwner: '60',
          otherPendingReservedOwner: '40',
          proposedExcessOwner: '0.01',
          ownerCurrencyPrecision: 2,
        }),
      ).toEqual({ decision: 'LIMIT_EXCEEDED', availableAllowanceOwner: '0', remainingAllowanceOwner: '0' });
    });
  });
});
