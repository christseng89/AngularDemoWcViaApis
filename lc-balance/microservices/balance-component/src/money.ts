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

/**
 * ISO 4217 minor-unit (decimal place) count per currency code — the server-side mirror of
 * src/app/transaction-builder/balance-component.model.ts's own CURRENCY_DECIMALS table (Angular UI),
 * kept in exact sync (same codes, same values, same 2dp fallback) so a value the UI's own Amount-field
 * warning/submit() guard already accepts is never rejected here, and vice versa (business requirement
 * 2026-08-16, "JPY 10000 without cents", explicitly extended to server-side enforcement the same day:
 * "must be enforced server-side based on the currency code and its configured currency decimal place").
 *
 * Unlike lc-payment-wc/microservices/payment-component/src/money.ts's own CURRENCY_MINOR_UNITS/
 * knownMinorUnitsForCurrency (which SKIPS the scale check entirely for a currency it has no data for,
 * since that project's Currency field is backed by a real Currency-API master and treats "no data" as
 * "don't guess") — this project's Currency field is free-typed with no master-data source at all (see
 * balance-component.model.ts's own CURRENCY_DECIMALS doc comment). A skip-when-unknown posture here
 * would mean an unrecognized currency code gets NO server-side scale enforcement at all, which is a
 * worse outcome for a free-typed field than falling back to the common-case default — so, deliberately
 * departing from the sibling project's convention, an unlisted currency here defaults to 2dp instead of
 * being skipped, matching the Angular side's own fallback exactly.
 */
export const CURRENCY_MINOR_UNITS: Readonly<Record<string, number>> = {
  JPY: 0,
  TWD: 0,
  IDR: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
};

/** Falls back to 2 decimal places for any currency not listed above — see CURRENCY_MINOR_UNITS's own doc comment for why (unlike the sibling payment-component project, this never skips the check). */
export function minorUnitsForCurrency(currency: string): number {
  return CURRENCY_MINOR_UNITS[currency.trim().toUpperCase()] ?? 2;
}

/**
 * Count of fractional digits literally present in a MonetaryAmount wire string (trailing zeros count
 * — "100.50" -> 2, "100" -> 0). Mirrors lc-payment-wc/microservices/payment-component/src/money.ts's
 * own decimalPlaces() exactly. Assumes the string already matched MONETARY_AMOUNT_PATTERN — callers
 * that haven't validated the pattern yet should do that first (see describeAmountScaleViolation).
 */
export function decimalPlaces(value: string): number {
  const dot = value.indexOf('.');
  return dot === -1 ? 0 : value.length - dot - 1;
}

/**
 * Returns a human-readable violation message if `amount`'s own literal decimal-place count exceeds
 * `currency`'s configured minor-unit scale, else `null`. Pure/non-throwing — deliberately doesn't
 * decide the HTTP mapping itself (that's routes/balanceMovements.ts's job, same separation of concerns
 * money.ts already keeps for parse/format errors) so this stays trivially unit-testable and reusable
 * from anywhere a wire-level amount+currency pair needs checking, not just the one current call site.
 */
export function describeAmountScaleViolation(amount: string, currency: string): string | null {
  const allowed = minorUnitsForCurrency(currency);
  const actual = decimalPlaces(amount);
  if (actual <= allowed) return null;
  return `amount "${amount}" has ${actual} decimal place(s) but currency ${currency.trim().toUpperCase()} allows at most ${allowed}`;
}
