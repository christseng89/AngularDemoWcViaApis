/**
 * Charge Component <-> Payment Component accounting bridge — added v1.4.0.
 * NOT part of the legacy trace (no §-section citation exists for this; the
 * legacy screens never had both components live in the same request path).
 *
 * An external Balance/Charge Component posts Dr Suspense - Debit / Dr
 * Suspense - Credit against its own contra account for a transaction. This
 * module expands a caller-submitted SuspenseBridge into the offsetting
 * Cr Suspense - Debit / Cr Suspense - Credit legs — ALWAYS credit, for every
 * entry in EITHER list, unconditionally (see buildSuspenseBridgeLeg's doc
 * comment for the balance identity this preserves) — plus FX Exchange pair
 * legs so the settlement voucher balances BY CURRENCY, not just in
 * transaction-currency aggregate.
 *
 * v1.7.0 — per-currency handling against the caller's own submitted legs, NOT
 * legacy-traced (no baseline equivalent; this repo's own feature request).
 * When a Suspense entry's currency differs from the transaction currency AND
 * the caller ALSO submitted real Payment Legs in that same currency (on the
 * SAME side — debitEntries against debitLegs, creditEntries against
 * creditLegs, computed fully independently), the caller's own leg combines
 * with gross Suspense to size the FX Exchange pair. The two sides combine
 * DIFFERENTLY, and this is a deliberate accounting distinction, not an
 * inconsistency:
 *
 *   - debitLegs are debit-direction; the Suspense bridge leg is always
 *     credit-direction — OPPOSITE polarity, so they genuinely NET
 *     (Net_C = legs − grossSuspense; can fall to exactly zero, meaning no FX
 *     conversion at all when a real leg exactly matches gross Suspense in
 *     that currency).
 *   - creditLegs are credit-direction; the Suspense bridge leg is ALSO
 *     credit-direction — SAME polarity, so they can never offset each other
 *     by subtraction: "Credit Suspense EUR 100 and a real Credit Leg EUR 100
 *     do NOT cancel — the EUR position is Credit EUR 200," per confirmed
 *     accounting review. They COMBINE (Combined_C = legs + grossSuspense),
 *     and the resulting FX Exchange pair is sized to that full combined
 *     amount, ALWAYS Debit(foreign currency)/Credit(transaction currency) —
 *     there is no sign to flip, Combined_C is never negative — and is
 *     skipped only in the degenerate case where both are exactly zero.
 *
 * The Suspense leg itself always still posts at the full GROSS amount
 * (unchanged from pre-v1.7.0) and always lands on credit, regardless of
 * side — netting/combining only ever sizes the accompanying FX Exchange
 * pair, never the Suspense leg itself, and never flips its direction. When
 * there is no matching-currency leg on the matching side (the common case,
 * and the entire pre-v1.7.0 behavior for both lists), every foreign-currency
 * bucket behaves byte-for-byte like pre-v1.7.0: Combined_C degenerates to
 * grossSuspense either way (0 + grossSuspense for credit-list, or
 * grossSuspense − 0 for debit-list).
 *
 * Ported 1:1 (pre-v1.7.0 baseline) from the algorithm previously implemented
 * client-side in
 * lc-payment-wc/src/app/payment-component/business-case-runner.component.ts
 * (suspenseBridgeLeg / fxExchangePairLegs / suspenseBridgeLegs). See
 * payment-instructions-post.yaml's SuspenseBridge schema for the full request
 * contract, including what this service does NOT adjust on the caller's
 * behalf (only Suspense/FX legs are ever ADDED — a caller's own submitted
 * debit/credit leg amounts are never modified).
 */
import type { PaymentLegInput, SuspenseBridge, SuspenseEntry, LegSide } from '../types';
import { parseMonetaryAmount, parseExchangeRate, formatMonetaryAmount, minorUnitsForCurrency, sumMonetaryAmounts } from '../money';
import { RequestValidationError } from '../errors';
import Decimal from 'decimal.js';

/**
 * One entry -> one Suspense leg (accountType SUSPENSE), landing on accountNo
 * 'Suspense - Debit' or 'Suspense - Credit' per which list it came from.
 * Always posted at the entry's own GROSS amount, and ALWAYS lands on the
 * CREDIT side — regardless of which list it came from, and unaffected by
 * v1.7.0 netting/combining — mirroring the original client-side
 * implementation's documented balance derivation:
 *
 *   Σ Debit  = (Total + SD)                                          = Total + SD
 *   Σ Credit = (Total - SC) + SD [bridge for SD] + SC [bridge for SC] = Total + SD
 *
 * (The caller is still responsible for the "Total + SD" / "Total - SC"
 * pre-adjustment on its own debitLegs/creditLegs — see this module's top
 * doc comment.) Returns null for a zero-amount entry (nothing to post).
 *
 * When entry.currency equals transactionCurrency, the original amount
 * string is passed through unchanged (no multiplication occurred, so no
 * rounding is needed and none is applied — preserves whatever precision the
 * caller submitted). When it differs, entry.crossRate is required (this
 * service does not resolve FX rates itself, same posture as
 * PaymentLegInput's own rate fields) and the transaction-currency-equivalent
 * amount is rounded to `minorUnitsForCurrency(transactionCurrency)` decimal
 * places (money.ts) — NOT a fixed precision. This must match whatever
 * rounding the caller used for its own "Total ± Σ entries" pre-adjustment
 * (see this module's top doc comment) exactly, or the two independently-
 * computed values for "the same" FX-equivalent amount can disagree by a
 * minor unit and fail the balance check below — this is why
 * CurrencyService.decimals() (lc-payment-wc's Simulator) and
 * minorUnitsForCurrency() here must stay in agreement per currency.
 */
export function buildSuspenseBridgeLeg(
  accountNo: 'Suspense - Debit' | 'Suspense - Credit',
  entry: SuspenseEntry,
  transactionCurrency: string,
): PaymentLegInput | null {
  const rawAmount = parseMonetaryAmount(entry.amount);

  if (entry.currency === transactionCurrency) {
    if (rawAmount.isZero()) return null;
    return {
      accountNo,
      accountType: 'SUSPENSE',
      currency: entry.currency,
      amountTxCcy: entry.amount,
    };
  }

  if (!entry.crossRate) {
    throw new RequestValidationError(
      `suspenseBridge entry in currency "${entry.currency}" differs from the transaction currency ` +
        `"${transactionCurrency}" (debitLegs[0].currency) but has no crossRate`,
    );
  }
  const rate = parseExchangeRate(entry.crossRate);
  const trxEquivalent = rawAmount.times(rate);
  const scale = minorUnitsForCurrency(transactionCurrency);
  const roundedTrxEquivalent = formatMonetaryAmount(trxEquivalent, scale);
  if (Number(roundedTrxEquivalent) === 0) return null;

  return {
    accountNo,
    accountType: 'SUSPENSE',
    currency: entry.currency,
    amountTxCcy: roundedTrxEquivalent,
    amountAccountCcy: entry.amount,
    crBuyRate: entry.crossRate,
  };
}

/**
 * The consolidated FX Exchange pair for ONE foreign currency bucket (v1.7.0
 * — replaces the pre-v1.7.0 per-entry buildFxExchangePairLegs, which sized
 * the pair to a single bridge leg's own gross amount; this sizes it to the
 * bucket's combined/net amount instead, and is called once per currency,
 * not once per entry — see expandSuspenseBridge for how that amount is
 * computed per side). Mirrors leg-allocator.component.ts's own fxPairs
 * concept: a same-currency-as-C "Other Ccy site" entry (account
 * `FX Exchange {transactionCurrency}`, amount = magnitude) and an
 * opposite-direction, transaction-currency "Trx Ccy site" entry (account
 * `FX Exchange {currency}`, amount = the Trx Equivalent of magnitude).
 *
 * `otherCcySiteIsCredit` is decided entirely by the CALLER (expandSuspenseBridge)
 * — this function has no side-specific logic of its own:
 *   - DEBIT-list, Net_C > 0 (a real debit leg's own currency-C exposure
 *     exceeds gross Suspense): otherCcySiteIsCredit = true — the excess
 *     needs fresh FX funding, same side as the bridge leg it extends.
 *   - DEBIT-list, Net_C < 0 (no/lesser matching leg): otherCcySiteIsCredit =
 *     false — same as pre-v1.7.0, cancels part of the bridge leg's own
 *     exposure.
 *   - CREDIT-list (Combined_C = legs + grossSuspense, always ≥ 0 — same
 *     polarity as the bridge leg, so they only ever combine, never net):
 *     otherCcySiteIsCredit = false, UNCONDITIONALLY — the combined credit
 *     exposure always needs a matching debit-side FX leg, regardless of
 *     magnitude.
 *
 * Returns { debit: [], credit: [] } when magnitude is exactly zero (nothing
 * to convert).
 */
export function buildNetFxExchangePairLegs(
  currency: string,
  transactionCurrency: string,
  magnitude: Decimal,
  otherCcySiteIsCredit: boolean,
  rateStr: string,
): { debit: PaymentLegInput[]; credit: PaymentLegInput[] } {
  if (magnitude.isZero()) return { debit: [], credit: [] };

  const rate = parseExchangeRate(rateStr);
  const absMagnitude = magnitude.abs();
  const trxEquivalent = formatMonetaryAmount(absMagnitude.times(rate), minorUnitsForCurrency(transactionCurrency));
  const otherCcyAmount = formatMonetaryAmount(absMagnitude, minorUnitsForCurrency(currency));

  const otherCcySiteLeg: PaymentLegInput = {
    accountNo: `FX Exchange ${transactionCurrency}`,
    accountType: 'INTERNAL',
    currency,
    amountTxCcy: trxEquivalent,
    amountAccountCcy: otherCcyAmount,
  };
  const trxCcySiteLeg: PaymentLegInput = {
    accountNo: `FX Exchange ${currency}`,
    accountType: 'INTERNAL',
    currency: transactionCurrency,
    amountTxCcy: trxEquivalent,
  };

  if (otherCcySiteIsCredit) {
    otherCcySiteLeg.crBuyRate = rateStr;
    trxCcySiteLeg.drBuyRate = rateStr;
    return { debit: [trxCcySiteLeg], credit: [otherCcySiteLeg] };
  }
  otherCcySiteLeg.drBuyRate = rateStr;
  trxCcySiteLeg.crBuyRate = rateStr;
  return { debit: [otherCcySiteLeg], credit: [trxCcySiteLeg] };
}

/** Sums a currency-C bucket's real legs using each leg's OWN-currency amount (amountAccountCcy — falls back to amountTxCcy when absent, e.g. a raw API caller that omitted it), NOT amountTxCcy directly (which is always transaction-currency-denominated regardless of the leg's own currency — see PaymentLegInput.amountTxCcy). This is what makes "Debit Leg = EUR 20" in the netting formula mean a genuinely EUR-denominated 20, not 20 units of the transaction currency. */
function sumLegsInCurrency(legs: readonly PaymentLegInput[], currency: string): Decimal {
  const matching = legs.filter((l) => l.currency === currency);
  return sumMonetaryAmounts(matching.map((l) => l.amountAccountCcy ?? l.amountTxCcy));
}

function groupByCurrency(entries: readonly SuspenseEntry[]): Map<string, SuspenseEntry[]> {
  const map = new Map<string, SuspenseEntry[]>();
  for (const entry of entries) {
    const bucket = map.get(entry.currency);
    if (bucket) bucket.push(entry);
    else map.set(entry.currency, [entry]);
  }
  return map;
}

/** All same-currency entries in a foreign-currency bucket must resolve to the same crossRate — they're independently caller-resolved via one deterministic FX lookup per currency pair, so a mismatch signals a caller-side inconsistency rather than a legitimate different rate. Required-ness of crossRate itself is already enforced per-entry by buildSuspenseBridgeLeg. Returns the raw crossRate string (not a Decimal) so it can be reused verbatim as the FX pair legs' own crBuyRate/drBuyRate, same as pre-v1.7.0's pass-through. */
function resolveBucketRate(currency: string, bucket: readonly SuspenseEntry[]): string {
  const rates = new Set(bucket.map((e) => e.crossRate));
  if (rates.size > 1) {
    throw new RequestValidationError(
      `suspenseBridge entries in currency "${currency}" carry different crossRate values (${[...rates].join(', ')}) — ` +
        'all entries for the same currency must resolve to the same rate.',
    );
  }
  return bucket[0]!.crossRate!;
}

/**
 * Every entry in both debitEntries/creditEntries, turned into its own gross
 * Suspense leg (see buildSuspenseBridgeLeg — always credit, regardless of
 * list), grouped by currency for the purpose of computing ONE consolidated
 * FX Exchange pair per foreign currency (v1.7.0 — see this file's top doc
 * comment for why debitEntries/debitLegs genuinely NET while
 * creditEntries/creditLegs only ever COMBINE). `debitLegs`/`creditLegs` are
 * the CALLER's own submitted legs (pre-bridge-expansion) — used only to
 * compute each foreign currency's combining amount; never modified.
 *
 * Entries whose currency equals transactionCurrency are unaffected by this
 * (case 1 of the feature spec — folds directly into the caller's own Leg #1
 * seed, no FX pair, always credit): each becomes its own credit leg, exactly
 * as pre-v1.7.0.
 *
 * For a foreign-currency bucket, currency C:
 *   L_C = Σ debitLegs/creditLegs (currency === C) own-currency amount
 *   S_C = Σ this bucket's entries' gross amount
 *   DEBIT-list:  Net_C = L_C − S_C (opposite polarity — genuine netting;
 *                FX pair skipped entirely when Net_C is exactly zero)
 *   CREDIT-list: Combined_C = L_C + S_C (same polarity — never nets to
 *                zero unless BOTH are zero)
 * Every entry in the bucket still posts its own gross, always-credit
 * Suspense leg; ONE consolidated FX Exchange pair is added for the bucket,
 * sized to the applicable amount above.
 */
export function expandSuspenseBridge(
  bridge: SuspenseBridge | undefined,
  transactionCurrency: string,
  debitLegs: readonly PaymentLegInput[] = [],
  creditLegs: readonly PaymentLegInput[] = [],
): { debit: PaymentLegInput[]; credit: PaymentLegInput[] } {
  const debit: PaymentLegInput[] = [];
  const credit: PaymentLegInput[] = [];
  if (!bridge) return { debit, credit };

  const sides: readonly {
    accountNo: 'Suspense - Debit' | 'Suspense - Credit';
    entries: readonly SuspenseEntry[];
    side: LegSide;
    sideLegs: readonly PaymentLegInput[];
  }[] = [
    { accountNo: 'Suspense - Debit', entries: bridge.debitEntries ?? [], side: 'DEBIT', sideLegs: debitLegs },
    { accountNo: 'Suspense - Credit', entries: bridge.creditEntries ?? [], side: 'CREDIT', sideLegs: creditLegs },
  ];

  for (const { accountNo, entries, side, sideLegs } of sides) {
    for (const [currency, bucket] of groupByCurrency(entries)) {
      // Every bridge leg lands on credit, unconditionally, for every currency and
      // every side — see this file's top doc comment / buildSuspenseBridgeLeg.
      for (const entry of bucket) {
        const leg = buildSuspenseBridgeLeg(accountNo, entry, transactionCurrency);
        if (leg) credit.push(leg);
      }

      if (currency === transactionCurrency) continue; // case 1 — no FX pair, ever.

      const grossSuspense = sumMonetaryAmounts(bucket.map((e) => e.amount));
      const legsInCurrency = sumLegsInCurrency(sideLegs, currency);

      // DEBIT: opposite polarity from the (always-credit) bridge leg -> genuine
      // netting, magnitude/direction both driven by the sign of Net_C.
      // CREDIT: same polarity as the bridge leg -> can only ever combine, never
      // cancel (see this file's top doc comment) -> magnitude = L_C + S_C,
      // always Debit(foreign)/Credit(trx), no sign to consider.
      const magnitude = side === 'DEBIT' ? legsInCurrency.minus(grossSuspense) : legsInCurrency.plus(grossSuspense);
      const otherCcySiteIsCredit = side === 'DEBIT' && magnitude.greaterThan(0);

      if (magnitude.isZero()) continue;
      const rate = resolveBucketRate(currency, bucket);
      const pair = buildNetFxExchangePairLegs(currency, transactionCurrency, magnitude, otherCcySiteIsCredit, rate);
      debit.push(...pair.debit);
      credit.push(...pair.credit);
    }
  }

  return { debit, credit };
}
