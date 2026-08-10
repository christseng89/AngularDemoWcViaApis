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
 * transaction-currency aggregate. EXCEPTION (2026-08-12, creditLegsComponentBridge
 * only — see that flag's own dated section below): a debitEntries-sourced leg posts
 * DEBIT instead, narrowly for that one mode; every other mode keeps the original
 * always-credit placement described above unchanged.
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
 * carry the identical amountTxCcy). No netting/combining step, and
 * therefore no debitEntries-vs-creditEntries asymmetry, is needed anymore —
 * each source (a real leg, or the Suspense entries in a currency) is
 * self-balancing on its own, and balance is additive: two independently
 * self-balancing pairs sum to a still-balanced whole. The Suspense leg(s)
 * themselves are unaffected by any of this — always posted gross, per
 * entry, always credit-direction, exactly as pre-v1.7.0.
 *
 * Ported 1:1 (pre-v1.7.0 baseline) from the algorithm previously implemented
 * client-side in
 * lc-payment-wc/src/app/payment-component/business-case-runner.component.ts
 * (suspenseBridgeLeg / fxExchangePairLegs / suspenseBridgeLegs). See
 * payment-instructions-post.yaml's SuspenseBridge schema for the full request
 * contract, including what this service does NOT adjust on the caller's
 * behalf (only Suspense/FX legs are ever ADDED — a caller's own submitted
 * debit/credit leg amounts are never modified).
 *
 * debitLegsComponentBridge diff-sized pair (2026-08-09, business-requirement-confirmed; flag
 * renamed from chargeComponentBridge 2026-08-10 — see lc-payment-wc/CLAUDE.md's dated entry) —
 * see the `if (debitLegsComponentBridge && side === 'CREDIT')` branch inside expandSuspenseBridge
 * below for the full rationale. Short version: a debitLegsComponentBridge request's real legs sit
 * on the OPPOSITE side from its suspenseBridge.creditEntries (creditLegs is always empty in that
 * mode), a direction the ordinary same-side "real-leg pair" logic above never checks. Instead of
 * the unconditional gross-sized Suspense pair every other request gets, a debitLegsComponentBridge
 * bucket gets ONE pair sized to the DIFFERENCE between the bucket's own gross amount and the
 * caller's matching-currency debitLegs — zero when they match exactly (no FX pair at all — no
 * conversion is actually happening), the full gross amount when there's no matching debit leg at
 * all (identical to the pre-existing behavior in that case), and just the residual otherwise.
 * Scoped narrowly (debitLegsComponentBridge:true only) to avoid the netting/combining class of bug
 * this file's v1.7.x history is full of — but safely so, because every pair here (gross- or
 * diff-sized, it makes no difference) is self-balancing by construction and therefore never
 * affects whether aggregate V8 passes; only the DISPLAYED magnitude changes. This pattern is not
 * charge-specific — the credit side may be sourced from a Charge Component OR a Customer IBL
 * Payment / Import Bill Loan scenario (Buyer's Usance LC funding, distinct from the existing
 * balanceModule:'IBL' "Import Bill Liability" tag), or a mix of both in one request; neither
 * upstream component's own books are modeled by this microservice.
 *
 * creditLegsComponentBridge (2026-08-12, business-requirement-confirmed) — the mirror image of
 * debitLegsComponentBridge above, for the opposite scenario: a Loan Component (or other upstream
 * component) generates the CREDIT-side funding obligation through a Suspense account (e.g.
 * Dr IBL / Cr Suspense - IBL for a Buyer's Usance LC), and Payment Component performs the actual
 * settlement to the beneficiary/Nostro account. A creditLegsComponentBridge:true request's
 * debitLegs is always empty; the entire debit side is provided by suspenseBridge.debitEntries.
 * Two things this mode changes that debitLegsComponentBridge does NOT need to:
 *   1. Leg placement itself. debitLegsComponentBridge only ever used suspenseBridge.creditEntries,
 *      whose desired direction (credit) already matched the general always-credit placement — no
 *      placement change was needed. creditLegsComponentBridge uses suspenseBridge.debitEntries,
 *      but wants a DEBIT-direction posting (Dr Suspense - Debit) — the opposite of what the
 *      general pattern gives a debitEntries-sourced leg. isFlippedDebitSide() inside
 *      expandSuspenseBridge below flips placement to `debit` specifically for this combination
 *      (creditLegsComponentBridge:true AND side === 'DEBIT') — every other combination (the
 *      general pattern, and debitLegsComponentBridge itself) is completely unaffected.
 *   2. The diff-sized FX pair — mirrored onto the `if (creditLegsComponentBridge && side ===
 *      'DEBIT')` branch below, comparing this bucket against the caller's own creditLegs (the
 *      opposite side, matching how debitLegsComponentBridge compares its CREDIT bucket against
 *      debitLegs). The anchor polarity is the mirror image too (DEBIT-anchored for diff > 0,
 *      CREDIT-anchored for diff < 0) — see that branch's own comment for why.
 * Account naming (reviewer-confirmed 2026-08-12): the Suspense leg still uses the existing
 * generic 'Suspense - Debit' account (accountNo is tied to which LIST an entry came from, per
 * buildSuspenseBridgeLeg, not to a per-scenario name) — NOT a literal 'Suspense - IBL' account.
 * Which upstream component/product a Suspense entry is for is metadata (sourceComponent), same
 * posture as the existing 'BALANCE'/'CHARGE' tags, not a custom account name.
 * Mutually exclusive with debitLegsComponentBridge (validation/requestSchema.ts's superRefine
 * rejects both true at once with a 400) — the general Balance/Charge Component bridge pattern
 * above already supports bridging both sides in one request without either narrow flag.
 */
import type { PaymentLegInput, SuspenseBridge, SuspenseEntry, LegSide } from '../types';
import { parseMonetaryAmount, parseExchangeRate, formatMonetaryAmount, minorUnitsForCurrency, sumMonetaryAmounts } from '../money';
import { RequestValidationError } from '../errors';
import Decimal from 'decimal.js';

/**
 * One entry -> one Suspense leg (accountType SUSPENSE), landing on accountNo
 * 'Suspense - Debit' or 'Suspense - Credit' per which list it came from — this
 * function itself does not decide which array (debit/credit) the leg is placed
 * into; expandSuspenseBridge's caller-side placement decides that (isFlippedDebitSide
 * — see that function and this module's top doc comment, creditLegsComponentBridge
 * section, for the one narrow exception). Always posted at the entry's own GROSS
 * amount. For every mode except creditLegsComponentBridge, the resulting leg ALWAYS
 * lands on the CREDIT side regardless of which list it came from, mirroring the
 * original client-side implementation's documented balance derivation:
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
 * list), grouped by currency. For each foreign-currency bucket, up to two
 * independent, self-balancing FX Exchange pairs are added (v1.8.0 — see
 * this file's top doc comment): one for the bucket's own Suspense entries,
 * one for the caller's own matching-currency real legs (skipped if none
 * exist). Entries whose currency equals transactionCurrency are unaffected
 * (case 1 — folds directly into the caller's own Leg #1 seed, no FX pair,
 * always credit): each becomes its own credit leg, exactly as pre-v1.7.0.
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
  debitLegsComponentBridge = false,
  creditLegsComponentBridge = false,
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

  // creditLegsComponentBridge:true flips debitEntries-sourced legs to DEBIT-direction —
  // see this file's top doc comment for the full rationale. Every other combination (including
  // creditEntries under creditLegsComponentBridge, and both lists under every other mode) keeps
  // the original always-credit placement.
  const isFlippedDebitSide = (side: LegSide): boolean => creditLegsComponentBridge && side === 'DEBIT';

  for (const { accountNo, entries, side, sideLegs } of sides) {
    for (const [currency, bucket] of groupByCurrency(entries)) {
      // Every bridge leg lands on credit, unconditionally, for every currency and every side —
      // see this file's top doc comment / buildSuspenseBridgeLeg — EXCEPT a debitEntries-sourced
      // leg under creditLegsComponentBridge:true, which lands on debit instead (isFlippedDebitSide
      // above).
      const bucketSuspenseLegs: PaymentLegInput[] = [];
      for (const entry of bucket) {
        const leg = buildSuspenseBridgeLeg(accountNo, entry, transactionCurrency);
        if (leg) {
          if (isFlippedDebitSide(side)) {
            // buildSuspenseBridgeLeg always labels a cross-currency entry's rate crBuyRate — a
            // safe assumption pre-2026-08-12, when every Suspense leg always posted credit. Now
            // that this one is being placed on debit, relabel to drBuyRate (matching buildFxPair's
            // own convention of tying the field name to actual DR/CR placement) — response-shape
            // correctness only, nothing downstream branches on crBuyRate vs drBuyRate today.
            if (leg.crBuyRate !== undefined) {
              leg.drBuyRate = leg.crBuyRate;
              delete leg.crBuyRate;
            }
            debit.push(leg);
          } else {
            credit.push(leg);
          }
          bucketSuspenseLegs.push(leg);
        }
      }

      if (currency === transactionCurrency) continue; // case 1 — no FX pair, ever.

      const rate = resolveBucketRate(currency, bucket);
      const grossSuspense = sumMonetaryAmounts(bucket.map((e) => e.amount));
      const suspenseTrxEq = sumMonetaryAmounts(bucketSuspenseLegs.map((l) => l.amountTxCcy));

      // Debit Legs Component Bridge Flag (2026-08-09, business-requirement-confirmed; renamed
      // from chargeComponentBridge 2026-08-10): a debitLegsComponentBridge request's real legs
      // are ALWAYS on the OPPOSITE side from its
      // suspenseBridge.creditEntries (Dr Customer A/C / Cr Suspense - Credit — creditLegs is
      // always empty in this mode, see this file's top doc comment), so the ordinary "real-leg
      // pair" below — which only ever compares AGAINST THE SAME side (creditEntries vs
      // creditLegs) — can never fire for it. Replaces BOTH the unconditional gross-sized
      // Suspense pair AND the (always-skipped, for this mode) same-side real-leg pair with ONE
      // pair sized to the DIFFERENCE between this bucket's own gross amount and the caller's
      // OPPOSITE-side debitLegs in the SAME native currency:
      //   - diff == 0 (exact match, e.g. 200 EUR debit vs 200 EUR Suspense Credit): NO FX pair
      //     at all — Dr CUST-ACC {ccy} X / Cr Suspense - Credit {ccy} X already balances BY
      //     CURRENCY on its own, so a full-gross pair would be pure decoration, misleadingly
      //     implying a conversion that never occurred.
      //   - diff > 0 (Suspense exceeds the matching debitLegs, e.g. no matching debit leg at
      //     all in this currency): a CREDIT-anchored pair sized to just the shortfall — when
      //     there's no matching leg at all this reduces to the pre-existing gross-sized
      //     behavior (matchingDebitLegs = 0, so diff = the full gross amount), unchanged.
      //   - diff < 0 (debitLegs exceed the Suspense bucket, e.g. a real leg partly funded by a
      //     DIFFERENT currency's surplus): a DEBIT-anchored pair sized to the excess, the
      //     mirror-image case.
      // Sized using suspenseTrxEq/oppositeTrx — both ALREADY-rounded, already-on-the-wire
      // amountTxCcy sums — via plain Decimal subtraction, never a fresh rate re-conversion of a
      // derived magnitude. This is deliberately NOT the same class of bug as the v1.7.3 attempt
      // this file's top doc comment describes (which combined amounts and re-converted the
      // combined figure at a single rate, drifting from what was already independently rounded
      // and on the wire): subtracting two figures that are each already final/verbatim cannot
      // introduce a NEW rounding disagreement the way re-multiplying a combined magnitude did.
      // A genuine, unexplained aggregate mismatch (no compensating leg anywhere else) is
      // UNAFFECTED by any of this either way — every pair here is self-balancing by
      // construction (adds the identical amount to both debit and credit), so it can never
      // change whether Σ debitLegs == Σ creditLegs; that still gets caught by
      // validateDrCrBalance (§3/V8) exactly as before, regardless of how this pair is sized.
      if (debitLegsComponentBridge && side === 'CREDIT') {
        const oppositeNative = sumLegsInCurrency(debitLegs, currency);
        const oppositeTrx = sumLegsTrxCcy(debitLegs, currency);
        const diffNative = grossSuspense.minus(oppositeNative);
        const diffTrx = suspenseTrxEq.minus(oppositeTrx);

        // NOTE: Decimal#isPositive() is true for >= 0 (zero counts as "positive" in decimal.js),
        // NOT strictly > 0 — greaterThan(0)/lessThan(0) are used here instead so the zero case
        // falls through neither branch, exactly as intended (diffNative === 0 means no pair).
        if (diffNative.greaterThan(0)) {
          const pair = buildFxPair(currency, transactionCurrency, diffNative, diffTrx, 'CREDIT', rate, ' - Suspense');
          debit.push(...pair.debit);
          credit.push(...pair.credit);
        } else if (diffNative.lessThan(0)) {
          const pair = buildFxPair(currency, transactionCurrency, diffNative.abs(), diffTrx.abs(), 'DEBIT', rate, ' - Suspense');
          debit.push(...pair.debit);
          credit.push(...pair.credit);
        }
        continue;
      }

      // creditLegsComponentBridge mirror of the branch above (2026-08-12) — same rationale,
      // opposite side and opposite anchor polarity: a creditLegsComponentBridge request's real
      // legs (creditLegs) are ALWAYS on the OPPOSITE side from its suspenseBridge.debitEntries
      // (debitLegs is always empty in this mode), and this bucket's own Suspense legs now post
      // DEBIT-direction (isFlippedDebitSide above) rather than the usual credit. diff is sized
      // identically (grossSuspense/suspenseTrxEq minus the opposite side's matching-currency
      // sum) but the anchor polarity flips to match: diff > 0 (Suspense exceeds the matching
      // creditLegs) anchors DEBIT — matching the Suspense leg's own new direction — instead of
      // CREDIT; diff < 0 (creditLegs exceed the Suspense bucket) anchors CREDIT instead of DEBIT.
      if (creditLegsComponentBridge && side === 'DEBIT') {
        const oppositeNative = sumLegsInCurrency(creditLegs, currency);
        const oppositeTrx = sumLegsTrxCcy(creditLegs, currency);
        const diffNative = grossSuspense.minus(oppositeNative);
        const diffTrx = suspenseTrxEq.minus(oppositeTrx);

        if (diffNative.greaterThan(0)) {
          const pair = buildFxPair(currency, transactionCurrency, diffNative, diffTrx, 'DEBIT', rate, ' - Suspense');
          debit.push(...pair.debit);
          credit.push(...pair.credit);
        } else if (diffNative.lessThan(0)) {
          const pair = buildFxPair(currency, transactionCurrency, diffNative.abs(), diffTrx.abs(), 'CREDIT', rate, ' - Suspense');
          debit.push(...pair.debit);
          credit.push(...pair.credit);
        }
        continue;
      }

      // Suspense's own pair — always CREDIT-anchored (the bridge leg's own fixed
      // direction), regardless of which list it came from. Sized to reuse the
      // bucket's own bridge legs' already-rounded amountTxCcy, summed — never
      // re-derived — so it always agrees exactly with what was just posted above.
      // Always suffixed " - Suspense" — even when no matching real leg coexists in this
      // currency (the common case) — so every Suspense-driven FX line is unambiguously
      // self-descriptive, not just when it happens to need disambiguating from a real leg's
      // own pair. A deliberate v1.8.0 naming change from the plain "FX Exchange {ccy}" this
      // pair carried pre-v1.8.0 when no leg coexisted.
      const suspensePair = buildFxPair(currency, transactionCurrency, grossSuspense, suspenseTrxEq, 'CREDIT', rate, ' - Suspense');
      debit.push(...suspensePair.debit);
      credit.push(...suspensePair.credit);

      // The caller's own matching real legs' pair — direction matches `side`.
      // Sized to reuse those legs' own already-submitted amountTxCcy, summed —
      // never re-derived — so it agrees exactly with whatever the caller put on
      // the wire, regardless of how many legs share the currency or what rate
      // each individually used. Skipped when no real leg exists in this currency.
      const legsOwnCcy = sumLegsInCurrency(sideLegs, currency);
      const legsTrxCcy = sumLegsTrxCcy(sideLegs, currency);
      const legPair = buildFxPair(currency, transactionCurrency, legsOwnCcy, legsTrxCcy, side, rate, '');
      debit.push(...legPair.debit);
      credit.push(...legPair.credit);
    }
  }

  return { debit, credit };
}
