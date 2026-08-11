/**
 * Charge/Balance Component <-> Payment Component accounting bridge — added v1.4.0.
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
 * v1.7.0/v1.7.1 (SUPERSEDED by v1.8.0 below, kept here for the record): when
 * a Suspense entry's currency differed from the transaction currency AND the
 * caller ALSO submitted real Payment Legs in that same currency, those tried
 * combining into ONE consolidated FX Exchange pair (Net_C for debitEntries,
 * Combined_C for creditEntries). That combined pair is always
 * aggregate-V8-safe but is NOT guaranteed to balance BY CURRENCY once a real
 * leg's own already-rounded amountTxCcy (computed by the caller, via
 * whatever rate direction ITS OWN leg-entry UI used) disagrees — by a minor
 * unit — from `round(combinedMagnitude × thisSuspenseEntry'sCrossRate)`. Two
 * different rate resolutions (the caller's own leg-level rate vs this
 * bucket's Suspense crossRate) are not guaranteed to be exact reciprocals at
 * 6dp, so "combine then convert once" can drift a cent from what the
 * caller's own leg already committed to on the wire.
 *
 * v1.8.0 — per-SOURCE FX pairs, not a per-currency combined one. For each
 * foreign-currency bucket, up to TWO independent FX Exchange pairs are now
 * generated instead of one:
 *   - a Suspense pair (`FX Exchange {ccy} - Suspense` / `FX Exchange
 *     {transactionCurrency} - Suspense`), sized to the SUM of this bucket's
 *     own Suspense bridge legs' OWN already-rounded amountTxCcy (reused
 *     verbatim, never re-derived) — always CREDIT-anchored, since the
 *     Suspense bridge leg is always credit-direction regardless of list.
 *   - a real-leg pair (`FX Exchange {ccy}` / `FX Exchange
 *     {transactionCurrency}`, unchanged names from pre-v1.7.0), sized to the
 *     SUM of the caller's own matching-currency legs' OWN already-submitted
 *     amountTxCcy (reused verbatim, never re-derived) — direction matches
 *     `side` (debitEntries' matching debitLegs are debit-direction;
 *     creditEntries' matching creditLegs are credit-direction). Skipped
 *     entirely when no real leg exists in that currency (the common case,
 *     and byte-for-byte pre-v1.7.0 behavior otherwise).
 * Because EACH pair reuses an already-computed, already-on-the-wire amount
 * instead of re-deriving anything from a combined magnitude, every currency
 * — including the transaction currency, once every bucket's contributions
 * are summed — balances exactly, simultaneously with aggregate V8 (which
 * was already guaranteed either way, since both legs of every pair always
 * carry the identical amountTxCcy). The Suspense leg(s) themselves are
 * unaffected by any of this — always posted gross, per entry, always
 * credit-direction, exactly as pre-v1.7.0.
 *
 * v1.9.0 (SUPERSEDES v1.8.0's "up to TWO independent pairs" for a
 * debitEntries bucket ONLY — 2026-08-13, business-requirement-confirmed,
 * Import LC Pay/Accept scenario): v1.8.0's independent-pairs approach was
 * byte-for-byte aggregate-safe but produced decorative FX Exchange lines
 * whenever a debitEntries bucket's Suspense entries were already fully
 * matched by a same-currency real Customer Debit leg (e.g. Suspense Debit
 * EUR 100 funded by a real Customer Debit EUR 100 — no conversion is
 * actually happening). Fixed by netting the Suspense pair against the
 * matching debitLegs pair — via plain Decimal subtraction of the two
 * ALREADY-rounded amounts (never a fresh rate re-conversion of a combined
 * magnitude, so this cannot reintroduce the v1.7.x combine-then-reconvert
 * drift bug) — down to at most ONE pair per bucket: see
 * expandSuspenseBridge's own inline comment for diff===0/diff>0/diff<0.
 * This is SAFE (preserves per-native-currency balance unconditionally —
 * proven, not just tested, in that inline comment) specifically because a
 * debitEntries Suspense leg lands CREDIT while its matching debitLegs are
 * DEBIT-direction — opposite actual placement, i.e. "the same money." A
 * creditEntries bucket's matching creditLegs are the SAME actual direction
 * the Suspense leg itself already lands on (both CREDIT) — a fundamentally
 * different, independent-exposure relationship where netting would silently
 * break per-currency balance — so v1.9.0 deliberately does NOT touch a
 * creditEntries bucket's own two-independent-pairs behavior, which stays
 * byte-for-byte pre-v1.9.0 (see the "reviewer-confirmed EUR100+EUR100" test).
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
 * 'Suspense - Debit' or 'Suspense - Credit' per which list it came from. Always
 * posted at the entry's own GROSS amount, and ALWAYS lands on the CREDIT side
 * regardless of which list it came from, mirroring the original client-side
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
 * places (money.ts) — NOT a fixed precision.
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
        `"${transactionCurrency}" but has no crossRate`,
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
 * ONE self-balancing FX Exchange pair for a single source (either "this
 * bucket's Suspense entries, combined" or "this bucket's matching real
 * legs, combined") in ONE foreign currency (v1.8.0 — see this file's top
 * doc comment for why a pair is now built per SOURCE rather than per
 * currency-bucket-combined-magnitude). Mirrors leg-allocator.component.ts's
 * own fxPairs concept: a same-currency-as-C "Other Ccy site" entry (account
 * `FX Exchange {transactionCurrency}{accountSuffix}`, amount = ownCcyAmount)
 * and an opposite-direction, transaction-currency "Trx Ccy site" entry
 * (account `FX Exchange {currency}{accountSuffix}`, amount = trxCcyAmount).
 *
 * `trxCcyAmount` is the source's OWN already-rounded transaction-currency
 * total, reused VERBATIM — this function never multiplies by a rate itself.
 * That is precisely what guarantees the pair agrees, to the minor unit,
 * with whatever the source already posted (a Suspense bridge leg's own
 * amountTxCcy, or a caller-submitted leg's own amountTxCcy) — there is only
 * ever ONE rounding of "the same" amount, not two independently-rounded
 * representations of overlapping exposure.
 *
 * `sourceDirection` is the Dr/Cr direction of the thing this pair
 * represents (a debitLegs entry -> DEBIT; a Suspense bridge leg -> always
 * CREDIT, regardless of list — see buildSuspenseBridgeLeg). The "Other Ccy
 * site" leg is the OPPOSITE direction (cancels the source's own currency
 * exposure in `currency`); the "Trx Ccy site" leg is the SAME direction
 * (represents that exposure in `transactionCurrency` terms).
 *
 * Returns { debit: [], credit: [] } when ownCcyAmount is exactly zero
 * (nothing to convert — e.g. no matching real leg in this currency).
 */
export function buildFxPair(
  currency: string,
  transactionCurrency: string,
  ownCcyAmount: Decimal,
  trxCcyAmount: Decimal,
  sourceDirection: LegSide,
  rateStr: string,
  accountSuffix: string,
): { debit: PaymentLegInput[]; credit: PaymentLegInput[] } {
  if (ownCcyAmount.isZero()) return { debit: [], credit: [] };

  const otherCcyAmount = formatMonetaryAmount(ownCcyAmount, minorUnitsForCurrency(currency));
  const trxEquivalent = formatMonetaryAmount(trxCcyAmount, minorUnitsForCurrency(transactionCurrency));

  const otherCcySiteLeg: PaymentLegInput = {
    accountNo: `FX Exchange ${transactionCurrency}${accountSuffix}`,
    accountType: 'INTERNAL',
    currency,
    amountTxCcy: trxEquivalent,
    amountAccountCcy: otherCcyAmount,
  };
  const trxCcySiteLeg: PaymentLegInput = {
    accountNo: `FX Exchange ${currency}${accountSuffix}`,
    accountType: 'INTERNAL',
    currency: transactionCurrency,
    amountTxCcy: trxEquivalent,
  };

  if (sourceDirection === 'CREDIT') {
    otherCcySiteLeg.drBuyRate = rateStr;
    trxCcySiteLeg.crBuyRate = rateStr;
    return { debit: [otherCcySiteLeg], credit: [trxCcySiteLeg] };
  }
  otherCcySiteLeg.crBuyRate = rateStr;
  trxCcySiteLeg.drBuyRate = rateStr;
  return { debit: [trxCcySiteLeg], credit: [otherCcySiteLeg] };
}

/** Sums a currency-C bucket's real legs using each leg's OWN-currency amount (amountAccountCcy — falls back to amountTxCcy when absent, e.g. a raw API caller that omitted it), NOT amountTxCcy directly (which is always transaction-currency-denominated regardless of the leg's own currency — see PaymentLegInput.amountTxCcy). This is what makes "Debit Leg = EUR 20" mean a genuinely EUR-denominated 20, not 20 units of the transaction currency. */
function sumLegsInCurrency(legs: readonly PaymentLegInput[], currency: string): Decimal {
  const matching = legs.filter((l) => l.currency === currency);
  return sumMonetaryAmounts(matching.map((l) => l.amountAccountCcy ?? l.amountTxCcy));
}

/** Sums a currency-C bucket's real legs using each leg's OWN already-submitted amountTxCcy — reused verbatim by buildFxPair's real-leg pair, never re-derived from a rate, so the pair always agrees exactly with whatever the caller actually put on the wire for that leg. */
function sumLegsTrxCcy(legs: readonly PaymentLegInput[], currency: string): Decimal {
  const matching = legs.filter((l) => l.currency === currency);
  return sumMonetaryAmounts(matching.map((l) => l.amountTxCcy));
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
 * list), grouped by currency. For each foreign-currency bucket:
 *   - a debitEntries bucket (side DEBIT) gets at most ONE self-balancing FX
 *     Exchange pair (v1.9.0 — see this file's top doc comment), sized to the
 *     DIFFERENCE between the bucket's own gross Suspense amount and the
 *     caller's matching-currency debitLegs: no pair at all when they match
 *     exactly, a Suspense-anchored pair for the shortfall when Suspense
 *     exceeds debitLegs (or there are no matching debitLegs at all — the
 *     common case, reducing to the full gross amount), a Leg-anchored pair
 *     for the excess when debitLegs exceed Suspense.
 *   - a creditEntries bucket (side CREDIT) is unaffected by v1.9.0 and keeps
 *     the original v1.8.0 behavior: up to TWO independent, gross-sized,
 *     self-balancing pairs (a Suspense pair, and — only when a matching
 *     creditLegs entry exists in that currency — a separate leg pair) —
 *     see this branch's own inline comment for why netting is unsafe here.
 * Entries whose currency equals transactionCurrency are unaffected (case 1
 * — folds directly into the caller's own Leg #1 seed, no FX pair, always
 * credit): each becomes its own credit leg, exactly as pre-v1.7.0.
 *
 * `debitLegs`/`creditLegs` are the CALLER's own submitted legs
 * (pre-bridge-expansion) — read only to size the real-leg FX pair; never
 * modified.
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
      // Every bridge leg lands on credit, unconditionally, for every currency and every side —
      // see this file's top doc comment / buildSuspenseBridgeLeg.
      const bucketSuspenseLegs: PaymentLegInput[] = [];
      for (const entry of bucket) {
        const leg = buildSuspenseBridgeLeg(accountNo, entry, transactionCurrency);
        if (leg) {
          credit.push(leg);
          bucketSuspenseLegs.push(leg);
        }
      }

      if (currency === transactionCurrency) continue; // case 1 — no FX pair, ever.

      const rate = resolveBucketRate(currency, bucket);
      const grossSuspense = sumMonetaryAmounts(bucket.map((e) => e.amount));
      const suspenseTrxEq = sumMonetaryAmounts(bucketSuspenseLegs.map((l) => l.amountTxCcy));

      // v1.9.0 (2026-08-13, business-requirement-confirmed — "Same Currency + Same Amount ->
      // Direct Settlement -> No FX Pair") — a debitEntries bucket ONLY (side === 'DEBIT') nets
      // its own gross Suspense amount against `debitLegs`' matching-currency sum, via plain
      // Decimal subtraction of two ALREADY-rounded, already-on-the-wire figures — never a fresh
      // rate re-conversion of a combined magnitude, so this cannot reintroduce the per-currency
      // drift the v1.7.x "combine then convert once" attempts caused (see this file's top doc
      // comment):
      //   - diff === 0 (exact match, e.g. Suspense Debit EUR 100 funded by a real Customer Debit
      //     EUR 100 — no conversion is actually happening): no FX pair at all, replacing what
      //     pre-v1.9.0 unconditionally emitted as TWO decorative, fully self-cancelling gross
      //     pairs (a Suspense pair and a leg pair) for the exact same net effect.
      //   - diff > 0 (Suspense exceeds the matching debitLegs, incl. the common "no matching
      //     debit leg at all" case, where diff reduces to the full gross amount — byte-for-byte
      //     the pre-existing behavior): a CREDIT-anchored pair (" - Suspense" suffix, matching the
      //     Suspense leg's own placement), sized to just the shortfall.
      //   - diff < 0 (the debitLegs exceed the Suspense bucket): a DEBIT-anchored pair (no
      //     suffix, matching the real leg's own direction), sized to just the excess.
      // This is SAFE (preserves per-native-currency balance for any S/L split — see this branch's
      // own worked-example tests) specifically because a debitEntries Suspense leg lands CREDIT
      // (buildSuspenseBridgeLeg's default) while its matching debitLegs are DEBIT-direction — i.e.
      // OPPOSITE actual placement, i.e. "a credit needs a debit counterpart."
      //
      // Deliberately NOT mirrored onto a creditEntries bucket (side === 'CREDIT'): there, the
      // matching creditLegs are the SAME actual direction the Suspense leg itself already lands
      // on (both CREDIT) — a same-direction real leg represents a genuinely INDEPENDENT exposure
      // (e.g. a real Nostro settlement leg, unrelated money, that merely happens to share a
      // currency with a Charge/Balance Component's Suspense-Credit bridge amount), not "the same
      // money" the way a real DEBIT leg naturally funds a CREDIT-landing Suspense entry. Netting
      // that combination would UNDER-post the FX pair and leave the settlement voucher genuinely
      // unbalanced BY CURRENCY (still aggregate-V8-safe, since every pair is self-balancing by
      // construction, but no longer decomposable per currency the way the "reviewer-confirmed
      // EUR100+EUR100" scenario below relies on) — so a creditEntries bucket keeps the original,
      // unconditional two-independent-pairs behavior below, completely untouched.
      if (side === 'DEBIT') {
        const oppositeNative = sumLegsInCurrency(debitLegs, currency);
        const oppositeTrx = sumLegsTrxCcy(debitLegs, currency);
        const diffNative = grossSuspense.minus(oppositeNative);
        const diffTrx = suspenseTrxEq.minus(oppositeTrx);

        // NOTE: Decimal#isPositive() is true for >= 0 in decimal.js — greaterThan(0)/lessThan(0)
        // are used here so diffNative === 0 falls through both branches (no pair at all).
        if (diffNative.greaterThan(0)) {
          const pair = buildFxPair(currency, transactionCurrency, diffNative, diffTrx, 'CREDIT', rate, ' - Suspense');
          debit.push(...pair.debit);
          credit.push(...pair.credit);
        } else if (diffNative.lessThan(0)) {
          // Leg-anchored (no " - Suspense" suffix, matching the pre-v1.9.0 "leg pair" naming) — a
          // debitLegs-exceeds-Suspense residual here is still meaningfully a real leg's own excess
          // exposure, so it keeps the distinct, un-suffixed Leg Pair label.
          const pair = buildFxPair(currency, transactionCurrency, diffNative.abs(), diffTrx.abs(), 'DEBIT', rate, '');
          debit.push(...pair.debit);
          credit.push(...pair.credit);
        }
        continue;
      }

      // Suspense's own pair — always CREDIT-anchored (the bridge leg's own fixed direction,
      // unaffected by v1.9.0 above, which only ever applies to a debitEntries bucket). Sized to
      // reuse the bucket's own bridge legs' already-rounded amountTxCcy, summed — never
      // re-derived — so it always agrees exactly with what was just posted above. Always
      // suffixed " - Suspense", even when no matching real leg coexists in this currency (the
      // common case) — so every Suspense-driven FX line is unambiguously self-descriptive, not
      // just when it happens to need disambiguating from a real leg's own pair.
      const suspensePair = buildFxPair(currency, transactionCurrency, grossSuspense, suspenseTrxEq, 'CREDIT', rate, ' - Suspense');
      debit.push(...suspensePair.debit);
      credit.push(...suspensePair.credit);

      // The caller's own matching real legs' pair — direction matches `side` (always CREDIT
      // here, since a debitEntries bucket already `continue`d above). Sized to reuse those legs'
      // own already-submitted amountTxCcy, summed — never re-derived — so it agrees exactly with
      // whatever the caller put on the wire. Skipped when no real leg exists in this currency.
      // Deliberately NOT netted against the Suspense pair above — see this branch's own doc
      // comment for why a same-direction real leg represents an independent exposure.
      const legsOwnCcy = sumLegsInCurrency(sideLegs, currency);
      const legsTrxCcy = sumLegsTrxCcy(sideLegs, currency);
      const legPair = buildFxPair(currency, transactionCurrency, legsOwnCcy, legsTrxCcy, side, rate, '');
      debit.push(...legPair.debit);
      credit.push(...legPair.credit);
    }
  }

  return { debit, credit };
}
