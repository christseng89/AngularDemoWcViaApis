import Decimal from 'decimal.js';
import { computeCeilingAmount, computeMonetaryAmendment, computeResultingTolerancePct } from '../../../src/domain/tolerance';

describe('computeResultingTolerancePct', () => {
  test('accumulates sequential increases exactly', () => {
    expect(computeResultingTolerancePct('0', '10', 'INCREASE')).toBe('10');
    expect(computeResultingTolerancePct('10', '5', 'INCREASE')).toBe('15');
  });

  test('allows decrease to exactly zero and rejects below zero', () => {
    expect(computeResultingTolerancePct('10', '10', 'DECREASE')).toBe('0');
    expect(() => computeResultingTolerancePct('10', '10.01', 'DECREASE')).toThrow('cannot exceed the current Tolerance of 10%');
  });

  test('rejects a negative change magnitude', () => {
    expect(() => computeResultingTolerancePct('10', '-1', 'INCREASE')).toThrow('must not be negative');
  });
});

describe('computeCeilingAmount (Design doc §6.2)', () => {
  test.each([
    ['ISSUE', '100000', '10', '110000'],
    ['AMEND_INCREASE', '10000', '10', '11000'],
    ['AMEND_DECREASE', '120000', '10', '132000'],
    ['AMEND_DECREASE', '105000', '10', '115500'],
  ])('%s amount=%s tolerancePct=%s -> ceilingAmount=%s (IPLC_LC)', (movementType, amount, tolerancePct, expected) => {
    expect(computeCeilingAmount(amount, tolerancePct, movementType, 'IPLC_LC').toFixed()).toBe(expected);
  });

  test('EPLC_LC is Tolerance-applicable too, not just IPLC_LC', () => {
    expect(computeCeilingAmount('100000', '10', 'ISSUE', 'EPLC_LC').toFixed()).toBe('110000');
  });

  test('EPLC_CONFIRMATION is Tolerance-applicable on its own ISSUE/AMEND (Export LC CONF LIAB, Maximum Exposure Basis, business-confirmed 2026-08-14)', () => {
    expect(computeCeilingAmount('100000', '10', 'ISSUE', 'EPLC_CONFIRMATION').toFixed()).toBe('110000');
    expect(computeCeilingAmount('10000', '10', 'AMEND', 'EPLC_CONFIRMATION').toFixed()).toBe('11000');
  });

  test('EPLC_CONFIRMATION HONOUR/ACCEPT are never Tolerance-converted (only ISSUE/AMEND are)', () => {
    expect(computeCeilingAmount('80000', '10', 'HONOUR', 'EPLC_CONFIRMATION').toFixed()).toBe('80000');
    expect(computeCeilingAmount('80000', '10', 'ACCEPT', 'EPLC_CONFIRMATION').toFixed()).toBe('80000');
  });

  test('UTILIZE is never Tolerance-converted, regardless of tolerancePct', () => {
    expect(computeCeilingAmount('50000', '10', 'UTILIZE', 'IPLC_LC').toFixed()).toBe('50000');
  });

  test('CREATE (Acceptance) is never Tolerance-converted', () => {
    expect(computeCeilingAmount('50000', '10', 'CREATE', 'IPLC_ACCEPTANCE').toFixed()).toBe('50000');
  });

  test('null tolerancePct is an identity conversion even for ISSUE/AMEND_* on IPLC_LC', () => {
    expect(computeCeilingAmount('100000', null, 'ISSUE', 'IPLC_LC').toFixed()).toBe('100000');
    expect(computeCeilingAmount('100000', undefined, 'AMEND_INCREASE', 'IPLC_LC').toFixed()).toBe('100000');
  });

  test('zero tolerancePct is also an identity conversion', () => {
    expect(computeCeilingAmount('100000', '0', 'ISSUE', 'IPLC_LC').toFixed()).toBe('100000');
  });

  test('business rule 2026-08-14: SG/Bills amounts are always their own face value, never Tolerance-adjusted, even with the same "ISSUE"/"AMEND_DECREASE" movementType string and a non-null tolerancePct', () => {
    expect(computeCeilingAmount('50000', '10', 'ISSUE', 'SHGT').toFixed()).toBe('50000');
    expect(computeCeilingAmount('50000', '10', 'AMEND_DECREASE', 'IPLC_ACCEPTANCE').toFixed()).toBe('50000');
  });

  test.each([
    ['JPY', '100', '0.5', '101'],
    ['USD', '100', '0.005', '100.01'],
    ['KWD', '100', '0.0005', '100.001'],
  ])('rounds a tolerance-derived LC balance for %s with ROUND_HALF_UP', (currency, amount, tolerancePct, expected) => {
    expect(computeCeilingAmount(amount, tolerancePct, 'ISSUE', 'IPLC_LC', currency).toFixed()).toBe(expected);
  });

  test('uses the existing 2-decimal fallback for an unlisted currency', () => {
    expect(computeCeilingAmount('100', '0.005', 'ISSUE', 'IPLC_LC', 'ZZZ').toFixed()).toBe('100.01');
  });
});

describe('computeMonetaryAmendment — recalculate from amended Current LC Amount', () => {
  test.each([
    ['Increase amount + increase tolerance', 'AMEND_INCREASE', '20000', '15', '120000', '138000', '102000', '28000', '28000'],
    ['Increase amount + decrease tolerance', 'AMEND_INCREASE', '20000', '5', '120000', '126000', '114000', '16000', '16000'],
    ['Decrease amount + increase tolerance', 'AMEND_DECREASE', '20000', '15', '80000', '92000', '68000', '-18000', '18000'],
    ['Decrease amount + decrease tolerance', 'AMEND_DECREASE', '20000', '5', '80000', '84000', '76000', '-26000', '26000'],
  ])(
    '%s',
    (_label, movementType, amendmentAmount, newTolerancePct, newFace, newUpper, newLower, balanceDelta, storedCeiling) => {
      const result = computeMonetaryAmendment({
        currentFaceAmount: new Decimal('100000'),
        currentTolerancePct: '10',
        amendmentAmount,
        movementType,
        newTolerancePct,
        instrumentType: 'IPLC_LC',
        currency: 'USD',
      });
      expect(result.newFaceAmount.toFixed()).toBe(newFace);
      expect(result.oldUpperLimit.toFixed()).toBe('110000');
      expect(result.newUpperLimit.toFixed()).toBe(newUpper);
      expect(result.newLowerLimit.toFixed()).toBe(newLower);
      expect(result.balanceDelta.toFixed()).toBe(balanceDelta);
      expect(result.movementCeilingAmount.toFixed()).toBe(storedCeiling);
    },
  );

  test('B2 signed AMEND uses the same recalculation rule', () => {
    const result = computeMonetaryAmendment({
      currentFaceAmount: new Decimal('100000'),
      currentTolerancePct: '10',
      amendmentAmount: '-20000',
      movementType: 'AMEND',
      newTolerancePct: '5',
      instrumentType: 'EPLC_CONFIRMATION',
      currency: 'USD',
    });
    expect(result.newFaceAmount.toFixed()).toBe('80000');
    expect(result.balanceDelta.toFixed()).toBe('-26000');
    expect(result.movementCeilingAmount.toFixed()).toBe('-26000');
  });

  test.each([
    ['Tolerance-only increase', 'AMEND_INCREASE', '10', '20', '100000', '110000', '120000', '10000'],
    ['Tolerance-only decrease', 'AMEND_DECREASE', '20', '15', '100000', '120000', '115000', '-5000'],
  ])('%s keeps Current LC Amount unchanged and recalculates the full upper limit', (_label, movementType, oldTolerance, newTolerance, face, oldUpper, newUpper, delta) => {
    const result = computeMonetaryAmendment({
      currentFaceAmount: new Decimal(face),
      currentTolerancePct: oldTolerance,
      amendmentAmount: '0',
      movementType,
      newTolerancePct: newTolerance,
      instrumentType: 'IPLC_LC',
      currency: 'USD',
    });
    expect(result.newFaceAmount.toFixed()).toBe(face);
    expect(result.oldUpperLimit.toFixed()).toBe(oldUpper);
    expect(result.newUpperLimit.toFixed()).toBe(newUpper);
    expect(result.balanceDelta.toFixed()).toBe(delta);
  });

  test('rejects an amendment that would make Current LC Amount negative', () => {
    expect(() =>
      computeMonetaryAmendment({
        currentFaceAmount: new Decimal('100000'),
        currentTolerancePct: '10',
        amendmentAmount: '100001',
        movementType: 'AMEND_DECREASE',
        newTolerancePct: '10',
        instrumentType: 'IPLC_LC',
        currency: 'USD',
      }),
    ).toThrow(/Current LC Amount negative/);
  });

  test.each([
    ['JPY', '100', '1', '0.5', '2'],
    ['USD', '100', '0.01', '0.005', '0.02'],
    ['KWD', '100', '0.001', '0.0005', '0.002'],
  ])('rounds the amended upper limit with ROUND_HALF_UP to %s decimal places before taking the balance delta', (currency, currentFace, amount, tolerancePct, expectedDelta) => {
    const result = computeMonetaryAmendment({
      currentFaceAmount: new Decimal(currentFace),
      currentTolerancePct: '0',
      amendmentAmount: amount,
      movementType: 'AMEND_INCREASE',
      newTolerancePct: tolerancePct,
      instrumentType: 'IPLC_LC',
      currency,
    });
    expect(result.balanceDelta.toFixed()).toBe(expectedDelta);
  });

  test('rejects a non-amendment movement type', () => {
    expect(() =>
      computeMonetaryAmendment({
        currentFaceAmount: new Decimal('100'),
        currentTolerancePct: '10',
        amendmentAmount: '1',
        movementType: 'AMEND_EXPIRY_DATE',
        newTolerancePct: '10',
        instrumentType: 'IPLC_LC',
        currency: 'USD',
      }),
    ).toThrow(/not a monetary amendment/);
  });

  test('defaults omitted tolerance and currency while retaining ROUND_HALF_UP semantics', () => {
    const result = computeMonetaryAmendment({
      currentFaceAmount: new Decimal('100.004'),
      currentTolerancePct: undefined,
      amendmentAmount: '0.001',
      movementType: 'AMEND',
      newTolerancePct: undefined,
      instrumentType: 'EPLC_CONFIRMATION',
    });
    expect(result.oldUpperLimit.toFixed()).toBe('100');
    expect(result.newUpperLimit.toFixed()).toBe('100.01');
    expect(result.newLowerLimit.toFixed()).toBe('100.01');
    expect(result.balanceDelta.toFixed()).toBe('0.01');
  });
});
