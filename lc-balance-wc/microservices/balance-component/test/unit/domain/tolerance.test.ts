import { computeCeilingAmount } from '../../../src/domain/tolerance';

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
