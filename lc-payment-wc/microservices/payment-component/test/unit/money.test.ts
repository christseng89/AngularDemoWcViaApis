import Decimal from 'decimal.js';
import {
  parseMonetaryAmount,
  parseExchangeRate,
  formatMonetaryAmount,
  formatExchangeRate,
  sumMonetaryAmounts,
  convertTxCcyToAccountCcy,
  minorUnitsForCurrency,
  knownMinorUnitsForCurrency,
  decimalPlaces,
  isNegativeAmount,
  isZeroRate,
  InvalidMonetaryAmountError,
  InvalidExchangeRateError,
  MONETARY_AMOUNT_PATTERN,
  EXCHANGE_RATE_PATTERN,
} from '../../src/money';

describe('money', () => {
  describe('MONETARY_AMOUNT_PATTERN / EXCHANGE_RATE_PATTERN', () => {
    it('are exported and usable as regexes', () => {
      expect(MONETARY_AMOUNT_PATTERN.test('100.50')).toBe(true);
      expect(EXCHANGE_RATE_PATTERN.test('1.2345')).toBe(true);
    });
  });

  describe('parseMonetaryAmount', () => {
    it('parses an integer amount', () => {
      expect(parseMonetaryAmount('100').toFixed()).toBe('100');
    });

    it('parses a negative amount', () => {
      expect(parseMonetaryAmount('-100.50').toFixed()).toBe('-100.5');
    });

    it('parses an amount with up to 3 decimal places', () => {
      expect(parseMonetaryAmount('1.234').toFixed()).toBe('1.234');
    });

    it('throws InvalidMonetaryAmountError for a non-decimal string', () => {
      expect(() => parseMonetaryAmount('abc')).toThrow(InvalidMonetaryAmountError);
    });

    it('throws for more than 3 decimal places', () => {
      expect(() => parseMonetaryAmount('1.2345')).toThrow(InvalidMonetaryAmountError);
    });

    it('throws for an empty string', () => {
      expect(() => parseMonetaryAmount('')).toThrow(InvalidMonetaryAmountError);
    });

    it('error message includes the offending value and name', () => {
      try {
        parseMonetaryAmount('bad');
        fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidMonetaryAmountError);
        expect((err as Error).name).toBe('InvalidMonetaryAmountError');
        expect((err as Error).message).toContain('bad');
      }
    });
  });

  describe('parseExchangeRate', () => {
    it('parses a valid rate', () => {
      expect(parseExchangeRate('1.234567').toFixed()).toBe('1.234567');
    });

    it('throws InvalidExchangeRateError for a negative rate (pattern has no leading -)', () => {
      expect(() => parseExchangeRate('-1.5')).toThrow(InvalidExchangeRateError);
    });

    it('throws for more than 10 decimal places', () => {
      expect(() => parseExchangeRate('1.12345678901')).toThrow(InvalidExchangeRateError);
    });

    it('error name is InvalidExchangeRateError', () => {
      try {
        parseExchangeRate('nope');
        fail('expected throw');
      } catch (err) {
        expect((err as Error).name).toBe('InvalidExchangeRateError');
      }
    });
  });

  describe('formatMonetaryAmount', () => {
    it('leaves precision untouched when scale is omitted', () => {
      expect(formatMonetaryAmount(new Decimal('12.5'))).toBe('12.5');
    });

    it('rounds to the given scale using ROUND_HALF_UP', () => {
      expect(formatMonetaryAmount(new Decimal('12.345'), 2)).toBe('12.35');
      expect(formatMonetaryAmount(new Decimal('12.344'), 2)).toBe('12.34');
    });

    it('formats to 0 decimal places for JPY-style scale', () => {
      expect(formatMonetaryAmount(new Decimal('1000.6'), 0)).toBe('1001');
    });

    it('throws InvalidMonetaryAmountError when the formatted value no longer fits the OAS pattern', () => {
      // 19 integer digits exceeds the pattern's 18-digit cap even after rounding.
      const tooLarge = new Decimal('1234567890123456789.90');
      expect(() => formatMonetaryAmount(tooLarge, 2)).toThrow(InvalidMonetaryAmountError);
    });
  });

  describe('formatExchangeRate', () => {
    it('formats a valid rate', () => {
      expect(formatExchangeRate(new Decimal('1.5'))).toBe('1.5');
    });

    it('throws InvalidExchangeRateError when the value exceeds the 12-integer-digit cap', () => {
      expect(() => formatExchangeRate(new Decimal('1234567890123'))).toThrow(InvalidExchangeRateError);
    });

    it('throws InvalidExchangeRateError for a negative Decimal (pattern disallows the sign)', () => {
      expect(() => formatExchangeRate(new Decimal('-1.5'))).toThrow(InvalidExchangeRateError);
    });
  });

  describe('sumMonetaryAmounts', () => {
    it('returns 0 for an empty array', () => {
      expect(sumMonetaryAmounts([]).toFixed()).toBe('0');
    });

    it('sums multiple decimal-string amounts exactly (no float drift)', () => {
      expect(sumMonetaryAmounts(['0.1', '0.2']).toFixed()).toBe('0.3');
    });

    it('propagates InvalidMonetaryAmountError for a malformed entry', () => {
      expect(() => sumMonetaryAmounts(['10', 'not-a-number'])).toThrow(InvalidMonetaryAmountError);
    });
  });

  describe('convertTxCcyToAccountCcy', () => {
    it('multiplies amount by rate', () => {
      const result = convertTxCcyToAccountCcy(new Decimal('100'), new Decimal('1.5'));
      expect(result.toFixed()).toBe('150');
    });
  });

  describe('minorUnitsForCurrency', () => {
    it('returns 0 for JPY/TWD/IDR', () => {
      expect(minorUnitsForCurrency('JPY')).toBe(0);
      expect(minorUnitsForCurrency('TWD')).toBe(0);
      expect(minorUnitsForCurrency('IDR')).toBe(0);
    });

    it('returns 2 for USD/EUR/GBP/CNY/HKD/SGD/AUD', () => {
      expect(minorUnitsForCurrency('USD')).toBe(2);
      expect(minorUnitsForCurrency('EUR')).toBe(2);
      expect(minorUnitsForCurrency('AUD')).toBe(2);
    });

    it('falls back to 2 for a currency not in the table', () => {
      expect(minorUnitsForCurrency('XYZ')).toBe(2);
    });
  });

  describe('knownMinorUnitsForCurrency', () => {
    it('returns the known minor units for a currency in the Currency master', () => {
      expect(knownMinorUnitsForCurrency('USD')).toBe(2);
      expect(knownMinorUnitsForCurrency('JPY')).toBe(0);
      expect(knownMinorUnitsForCurrency('CNY')).toBe(2);
    });

    it('returns undefined (NOT a fallback of 2) for a currency not in the master', () => {
      expect(knownMinorUnitsForCurrency('BHD')).toBeUndefined();
      expect(knownMinorUnitsForCurrency('XYZ')).toBeUndefined();
    });
  });

  describe('decimalPlaces', () => {
    it('returns 0 for an integer amount', () => {
      expect(decimalPlaces('100')).toBe(0);
    });

    it('counts fractional digits, trailing zeros included', () => {
      expect(decimalPlaces('100.5')).toBe(1);
      expect(decimalPlaces('100.50')).toBe(2);
      expect(decimalPlaces('1.234')).toBe(3);
    });

    it('handles a negative amount', () => {
      expect(decimalPlaces('-99.9')).toBe(1);
    });
  });

  describe('isNegativeAmount', () => {
    it('is true for a strictly-negative amount', () => {
      expect(isNegativeAmount('-100')).toBe(true);
      expect(isNegativeAmount('-0.01')).toBe(true);
    });

    it('is false for zero, "-0"/"-0.00", and positive amounts', () => {
      expect(isNegativeAmount('0')).toBe(false);
      expect(isNegativeAmount('-0')).toBe(false);
      expect(isNegativeAmount('-0.00')).toBe(false);
      expect(isNegativeAmount('100')).toBe(false);
      expect(isNegativeAmount('0.50')).toBe(false);
    });
  });

  describe('isZeroRate', () => {
    it('is true for any all-zero rate string', () => {
      expect(isZeroRate('0')).toBe(true);
      expect(isZeroRate('0.0')).toBe(true);
      expect(isZeroRate('0.0000000000')).toBe(true);
      expect(isZeroRate('00')).toBe(true);
    });

    it('is false for a positive rate', () => {
      expect(isZeroRate('1')).toBe(false);
      expect(isZeroRate('0.0000000001')).toBe(false);
      expect(isZeroRate('1.100000')).toBe(false);
    });
  });
});
