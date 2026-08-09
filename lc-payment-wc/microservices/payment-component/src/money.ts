/**
 * Decimal-string handling for MonetaryAmount / ExchangeRate (OAS v1.2.0).
 *
 * The OAS deliberately types every monetary/rate field as a pattern-constrained
 * STRING, not `number` — per payment-instructions-post.yaml's MonetaryAmount
 * description: "Server-side arithmetic and the Dr/Cr balance check (§5.4 step 1)
 * MUST use decimal/BigDecimal, never IEEE-754 double." This module is the only
 * place in the service allowed to construct a Decimal from a wire string —
 * every other module should go through here rather than touching Decimal
 * directly, so the pattern is enforced at a single choke point.
 */
import Decimal from 'decimal.js';

// Same patterns as payment-instructions-post.yaml — kept in exact sync with the OAS.
export const MONETARY_AMOUNT_PATTERN = /^-?\d{1,18}(\.\d{1,3})?$/;
export const EXCHANGE_RATE_PATTERN = /^\d{1,12}(\.\d{1,10})?$/;

export class InvalidMonetaryAmountError extends Error {
  constructor(value: string) {
    super(`"${value}" is not a valid MonetaryAmount (expected ${MONETARY_AMOUNT_PATTERN})`);
    this.name = 'InvalidMonetaryAmountError';
  }
}

export class InvalidExchangeRateError extends Error {
  constructor(value: string) {
    super(`"${value}" is not a valid ExchangeRate (expected ${EXCHANGE_RATE_PATTERN})`);
    this.name = 'InvalidExchangeRateError';
  }
}

/** Parse an OAS MonetaryAmount string into a Decimal. Throws if the pattern doesn't match. */
export function parseMonetaryAmount(value: string): Decimal {
  if (!MONETARY_AMOUNT_PATTERN.test(value)) {
    throw new InvalidMonetaryAmountError(value);
  }
  return new Decimal(value);
}

/** Parse an OAS ExchangeRate string into a Decimal. Throws if the pattern doesn't match. */
export function parseExchangeRate(value: string): Decimal {
  if (!EXCHANGE_RATE_PATTERN.test(value)) {
    throw new InvalidExchangeRateError(value);
  }
  return new Decimal(value);
}

/**
 * Format a Decimal back into an OAS MonetaryAmount string.
 * `scale` mirrors the source's currency-driven scale note (2 for EUR/USD, 0 for
 * JPY, 3 for BHD/KWD) — pass the currency's minor-unit count. Defaults to
 * leaving the value at whatever precision the Decimal already carries when
 * `scale` is omitted, which is appropriate for values that were never divided
 * (e.g. a straight sum of already-correctly-scaled inputs).
 */
export function formatMonetaryAmount(value: Decimal, scale?: number): MonetaryAmountString {
  const out = scale === undefined ? value : value.toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
  const str = out.toFixed();
  if (!MONETARY_AMOUNT_PATTERN.test(str)) {
    // Should be unreachable given MonetaryAmount allows up to 18 integer digits
    // and 3 decimal places, but fail loudly rather than emit a wire value the
    // OAS itself would reject.
    throw new InvalidMonetaryAmountError(str);
  }
  return str;
}

export function formatExchangeRate(value: Decimal): ExchangeRateString {
  const str = value.toFixed();
  if (!EXCHANGE_RATE_PATTERN.test(str)) {
    throw new InvalidExchangeRateError(str);
  }
  return str;
}

/** Sum a list of OAS MonetaryAmount strings using exact decimal arithmetic. */
export function sumMonetaryAmounts(values: readonly string[]): Decimal {
  return values.reduce((acc: Decimal, v) => acc.plus(parseMonetaryAmount(v)), new Decimal(0));
}

/**
 * Minor-unit decimal places per currency — mirrors
 * lc-payment-wc/backend/data/currencies.json (the "Get Currency API" demo
 * data the Angular Simulator's CurrencyService.decimals() reads), duplicated
 * here because this microservice is an independently-deployable Node project
 * with no currency-master data source of its own. Falls back to 2 for any
 * currency not in this table — matches that backend's own dp(ccy) fallback
 * and ISO 4217's default minor-unit count for most real currencies.
 *
 * Used wherever this service computes (rather than passes through verbatim)
 * a monetary amount that needs currency-correct rounding — e.g.
 * domain/suspenseBridge.ts's cross-currency FX-equivalent conversion. Must
 * stay in agreement with the Simulator's own CurrencyService.decimals() for
 * the same currency, or a client-computed amount and this service's
 * independently-computed amount for "the same" quantity can round to
 * different values and break the exact-equality Dr/Cr balance check
 * (domain/balanceValidation.ts) by a minor unit. Keep in sync with
 * backend/data/currencies.json if that table changes.
 */
const CURRENCY_MINOR_UNITS: Readonly<Record<string, number>> = {
  USD: 2,
  EUR: 2,
  JPY: 0,
  GBP: 2,
  TWD: 0,
  IDR: 0,
  CNY: 2,
  HKD: 2,
  SGD: 2,
  AUD: 2,
};

export function minorUnitsForCurrency(currency: string): number {
  return CURRENCY_MINOR_UNITS[currency] ?? 2;
}

/**
 * The currency's minor-unit count IF this service knows it (i.e. the currency
 * is present in the Currency-API-sourced master CURRENCY_MINOR_UNITS above),
 * else `undefined`.
 *
 * Distinct from minorUnitsForCurrency (which falls back to 2 so ARITHMETIC
 * rounding always has some scale). Input VALIDATION must instead be able to
 * tell "known 0/2/3-dp currency" apart from "currency we have no master data
 * for": the Currency API is the source of truth for a currency's decimal
 * places, so if we don't hold its data we must NOT invent a limit of 2 —
 * that would wrongly reject a legitimate 3-minor-unit amount (BHD/KWD/OMR) or
 * wrongly accept an over-precise amount in a currency that is really 0-dp.
 * Callers use `undefined` to SKIP the decimal-scale check for such a currency.
 */
export function knownMinorUnitsForCurrency(currency: string): number | undefined {
  return CURRENCY_MINOR_UNITS[currency];
}

/**
 * Count of fractional digits literally present in a MonetaryAmount wire string
 * (trailing zeros count — "100.50" -> 2, "100" -> 0). Used to check a submitted
 * amount against its currency's minor-unit scale (see requestSchema.ts). Assumes
 * the string already matched MONETARY_AMOUNT_PATTERN.
 */
export function decimalPlaces(value: string): number {
  const dot = value.indexOf('.');
  return dot === -1 ? 0 : value.length - dot - 1;
}

/**
 * True iff a MonetaryAmount wire string is strictly negative (< 0). `-0` /
 * `-0.00` count as zero, not negative. A pure string test (any non-zero digit
 * after a leading `-`), so it is SAFE on a value that has not yet been
 * pattern-validated — it never parses/throws. Used to reject negative CALLER
 * amounts (M-1): direction is expressed by the Dr/Cr side, never by a negative
 * sign; the only "negative" concept in the ledger is the FX Exchange (兌換)
 * Dr/Cr side-swap (借貸對調), which the SERVER performs by choosing the side
 * with a positive amount — never a literal negative — and which is generated
 * after this validation runs, so it is unaffected.
 */
export function isNegativeAmount(value: string): boolean {
  return value.startsWith('-') && /[1-9]/.test(value);
}

/**
 * §8.2 of Payment_Component_Calculation_Validation.docx:
 *   CPYT_DR_AMT_DRCCY = CPYT_DR_AMT_TXCCY × CPYT_DR_BUY_RATE   (debit)
 *   CPYT_CR_AMT_CRCCY = CPYT_CR_AMT_TXCCY × CPYT_CR_BUY_RATE   (credit, symmetric)
 * Source: SSSS_PaymentDebit.js:53-66 / SSSS_PaymentCredit.js:261-265.
 */
export function convertTxCcyToAccountCcy(amountTxCcy: Decimal, rate: Decimal): Decimal {
  return amountTxCcy.times(rate);
}

// Branded string aliases purely for readability at call sites; structurally
// identical to `string` so they interoperate with the OAS types in types.ts.
export type MonetaryAmountString = string;
export type ExchangeRateString = string;
