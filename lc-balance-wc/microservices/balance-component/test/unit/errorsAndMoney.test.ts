import {
  ContractVersionConflictError,
  IllegalStateTransitionError,
  InsufficientBalanceError,
  NotFoundError,
  RequestValidationError,
} from '../../src/errors';
import { formatMonetaryAmount, InvalidMonetaryAmountError, parseMonetaryAmount, sumMonetaryAmounts } from '../../src/money';
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
});
