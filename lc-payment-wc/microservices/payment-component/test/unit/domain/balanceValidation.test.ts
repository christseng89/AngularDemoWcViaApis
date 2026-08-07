import Decimal from 'decimal.js';
import { validateDrCrBalance, RPFM_BALANCE_TOLERANCE } from '../../../src/domain/balanceValidation';
import { BusinessValidationError } from '../../../src/errors';
import type { PaymentLegInput } from '../../../src/types';

function leg(amountTxCcy: string): PaymentLegInput {
  return { accountNo: 'ACC-1', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy };
}

describe('validateDrCrBalance', () => {
  it('passes and returns totals/difference when debit and credit totals match exactly', () => {
    const result = validateDrCrBalance([leg('100')], [leg('100')]);
    expect(result.debitTotal.toFixed()).toBe('100');
    expect(result.creditTotal.toFixed()).toBe('100');
    expect(result.difference.toFixed()).toBe('0');
  });

  it('sums multiple legs per side before comparing', () => {
    const result = validateDrCrBalance([leg('60'), leg('40')], [leg('100')]);
    expect(result.debitTotal.toFixed()).toBe('100');
  });

  it('throws BusinessValidationError with LEGS_UNBALANCED when totals differ beyond the default zero tolerance', () => {
    expect(() => validateDrCrBalance([leg('100')], [leg('99.99')])).toThrow(BusinessValidationError);
    try {
      validateDrCrBalance([leg('100')], [leg('99.99')]);
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BusinessValidationError);
      expect((err as BusinessValidationError).code).toBe('LEGS_UNBALANCED');
      expect((err as BusinessValidationError).httpStatus).toBe(409);
      expect((err as BusinessValidationError).message).toContain('100');
      expect((err as BusinessValidationError).message).toContain('99.99');
    }
  });

  it('does not throw when the difference is exactly at the tolerance boundary', () => {
    const result = validateDrCrBalance([leg('100')], [leg('99.99')], '0.01');
    expect(result.difference.toFixed()).toBe('0.01');
  });

  it('throws when the difference exceeds the tolerance, even by a fraction', () => {
    expect(() => validateDrCrBalance([leg('100')], [leg('99.98')], '0.01')).toThrow(BusinessValidationError);
  });

  it('accepts a negative difference within tolerance (credit exceeds debit)', () => {
    const result = validateDrCrBalance([leg('99.99')], [leg('100')], RPFM_BALANCE_TOLERANCE);
    expect(result.difference.toFixed()).toBe('-0.01');
  });

  it('RPFM_BALANCE_TOLERANCE is 0.01', () => {
    expect(RPFM_BALANCE_TOLERANCE).toBeInstanceOf(Decimal);
    expect(RPFM_BALANCE_TOLERANCE.toFixed()).toBe('0.01');
  });
});
