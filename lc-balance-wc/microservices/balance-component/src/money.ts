/**
 * Decimal-string handling for MonetaryAmount (Design doc — mirrors
 * lc-payment-wc/microservices/payment-component/src/money.ts's convention
 * exactly, per balance-component-api.yaml's MonetaryAmount description:
 * "Mirrors payment-instructions-post.yaml's convention exactly... server-side
 * arithmetic MUST use decimal/BigDecimal, never a binary float/JSON number."
 * This module is the only place in the service allowed to construct a
 * Decimal from a wire string.
 */
import Decimal from 'decimal.js';

export const MONETARY_AMOUNT_PATTERN = /^-?\d{1,18}(\.\d{1,3})?$/;

export class InvalidMonetaryAmountError extends Error {
  constructor(value: string) {
    super(`"${value}" is not a valid MonetaryAmount (expected ${MONETARY_AMOUNT_PATTERN})`);
    this.name = 'InvalidMonetaryAmountError';
  }
}

export function parseMonetaryAmount(value: string): Decimal {
  if (!MONETARY_AMOUNT_PATTERN.test(value)) {
    throw new InvalidMonetaryAmountError(value);
  }
  return new Decimal(value);
}

/** scale is the currency's minor-unit count; omit to leave precision as-is. */
export function formatMonetaryAmount(value: Decimal, scale?: number): string {
  const out = scale === undefined ? value : value.toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
  const str = out.toFixed();
  if (!MONETARY_AMOUNT_PATTERN.test(str)) {
    throw new InvalidMonetaryAmountError(str);
  }
  return str;
}

/** Sum a list of MonetaryAmount wire strings using exact decimal arithmetic. */
export function sumMonetaryAmounts(values: readonly string[]): Decimal {
  return values.reduce((acc: Decimal, v) => acc.plus(parseMonetaryAmount(v)), new Decimal(0));
}

export const ZERO = new Decimal(0);
