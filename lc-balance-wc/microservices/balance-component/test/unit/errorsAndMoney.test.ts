import { ContractVersionConflictError, IllegalStateTransitionError, InsufficientBalanceError, NotFoundError, RequestValidationError } from '../../src/errors';
import {
  decimalPlaces,
  describeAmountScaleViolation,
  formatMonetaryAmount,
  InvalidMonetaryAmountError,
  minorUnitsForCurrency,
  parseMonetaryAmount,
  sumMonetaryAmounts,
} from '../../src/money';
import Decimal from 'decimal.js';

describe('errors.ts', () => {
  test.each([
    [new RequestValidationError('bad request'), 400, 'REQUEST_VALIDATION_FAILED'],
    [new InsufficientBalanceError('not enough'), 409, 'INSUFFICIENT_AVAILABLE_BALANCE'],
    [new IllegalStateTransitionError('bad transition'), 409, 'ILLEGAL_STATE_TRANSITION'],
    [new NotFoundError('missing'), 404, 'NOT_FOUND'],
    [new ContractVersionConflictError('conflict'), 409, 'CONTRACT_VERSION_CONFLICT'],
  ])('%p has the right httpStatus/code/toBody', (err, httpStatus, code) => {
    expect(err.httpStatus).toBe(httpStatus);
    expect(err.code).toBe(code);
    expect(err.toBody()).toEqual({ code, message: err.message });
  });
});

describe('money.ts', () => {
  test('parseMonetaryAmount accepts a valid decimal string', () => {
    expect(parseMonetaryAmount('123.45').toFixed()).toBe('123.45');
  });

  test('parseMonetaryAmount rejects an invalid string', () => {
    expect(() => parseMonetaryAmount('abc')).toThrow(InvalidMonetaryAmountError);
  });

  test('formatMonetaryAmount rounds to the given scale', () => {
    expect(formatMonetaryAmount(new Decimal('100.005'), 2)).toBe('100.01');
  });

  test('formatMonetaryAmount without a scale leaves precision as-is', () => {
    expect(formatMonetaryAmount(new Decimal('100'))).toBe('100');
  });

  test('sumMonetaryAmounts sums exactly via Decimal, not binary floats', () => {
    expect(sumMonetaryAmounts(['0.1', '0.2']).toFixed()).toBe('0.3');
  });

  test('formatMonetaryAmount throws InvalidMonetaryAmountError when the requested scale itself produces an out-of-pattern string (MONETARY_AMOUNT_PATTERN allows at most 3 decimal digits — a scale of 4 rounds to a genuine 4-decimal-digit figure, which the pattern then rejects)', () => {
    expect(() => formatMonetaryAmount(new Decimal('100.12345'), 4)).toThrow(InvalidMonetaryAmountError);
    expect(() => formatMonetaryAmount(new Decimal('100.12345'), 4)).toThrow(/is not a valid MonetaryAmount/);
  });

  // Business requirement 2026-08-16 ("JPY 10000 without cents" -> "must be enforced server-side based
  // on the currency code and its configured currency decimal place") — mirrors
  // src/app/transaction-builder/balance-component.model.ts's own CURRENCY_DECIMALS table exactly.
  describe('minorUnitsForCurrency / decimalPlaces / describeAmountScaleViolation', () => {
    test.each([
      ['JPY', 0],
      ['TWD', 0],
      ['IDR', 0],
      ['KRW', 0],
      ['VND', 0],
      ['CLP', 0],
      ['ISK', 0],
      ['BHD', 3],
      ['IQD', 3],
      ['JOD', 3],
      ['KWD', 3],
      ['OMR', 3],
      ['TND', 3],
      ['USD', 2],
      ['EUR', 2],
    ])('minorUnitsForCurrency(%s) -> %i', (currency, expected) => {
      expect(minorUnitsForCurrency(currency)).toBe(expected);
    });

    test('minorUnitsForCurrency falls back to 2 for a currency not in the table (never skips the check, unlike the sibling payment-component project)', () => {
      expect(minorUnitsForCurrency('XYZ')).toBe(2);
    });

    test('minorUnitsForCurrency is case-insensitive and trims whitespace', () => {
      expect(minorUnitsForCurrency('jpy')).toBe(0);
      expect(minorUnitsForCurrency(' Jpy ')).toBe(0);
    });

    test.each([
      ['100', 0],
      ['100.5', 1],
      ['100.50', 2],
      ['100.500', 3],
    ])('decimalPlaces(%s) -> %i', (value, expected) => {
      expect(decimalPlaces(value)).toBe(expected);
    });

    test("describeAmountScaleViolation returns null when the amount is within the currency's allowed scale", () => {
      expect(describeAmountScaleViolation('10000', 'JPY')).toBeNull();
      expect(describeAmountScaleViolation('100.50', 'USD')).toBeNull();
      expect(describeAmountScaleViolation('100.125', 'KWD')).toBeNull();
    });

    test("describeAmountScaleViolation returns a message when the amount exceeds the currency's allowed scale", () => {
      expect(describeAmountScaleViolation('10000.50', 'JPY')).toBe('amount "10000.50" has 2 decimal place(s) but currency JPY allows at most 0');
    });

    test('describeAmountScaleViolation uppercases the currency in its message, regardless of the input casing', () => {
      expect(describeAmountScaleViolation('10000.50', 'jpy')).toMatch(/currency JPY allows/);
    });
  });
});
