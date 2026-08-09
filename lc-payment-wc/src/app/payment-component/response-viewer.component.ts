import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import Decimal from 'decimal.js';
import type { AccountEntry, ClassificationResult, DrCrIndicator, SwiftMessage } from './payment-component.types';
import type { FxPairEntry } from './leg-allocator.component';

interface BalancePreview {
  debitTotal: string;
  creditTotal: string;
  difference: string;
  balanced: boolean;
}

export interface SettlementSection {
  label: string;
  entries: AccountEntry[];
}

/**
 * One row as shown in Currency View. Normalized from TWO different source shapes (see
 * currencyGroups below) — real AccountEntry objects (groupedSettlementEntries) and the
 * client-only FxPairEntry overlay (debitFxPairs/creditFxPairs) — so this is its own minimal
 * shape rather than `extends AccountEntry`: `amount` is always a string (FxPairEntry's is a
 * number), `glAccount` is used for both AccountEntry.glAccount and FxPairEntry.account, and
 * `description` covers both AccountEntry.description and FxPairEntry.site.
 */
export interface CurrencyViewEntry {
  drCrIndicator: DrCrIndicator;
  glAccount: string;
  amount: string;
  entryType: string;
  description: string;
}

export interface CurrencyGroup {
  currency: string;
  entries: CurrencyViewEntry[];
  totalDebit: string;
  totalCredit: string;
  difference: string;
  balanced: boolean;
}

const FX_PREFIX = 'FX Exchange ';
const SUSPENSE_SUFFIX = ' - Suspense';

/** Splits "FX Exchange {ccy}" / "FX Exchange {ccy} - Suspense" into the currency it references (the OTHER leg's own currency — see suspenseBridge.ts's buildFxPair) and whether it's Suspense-driven. */
function parseFxAccount(glAccount: string): { referencedCurrency: string; isSuspense: boolean } {
  const isSuspense = glAccount.endsWith(SUSPENSE_SUFFIX);
  const body = isSuspense ? glAccount.slice(0, -SUSPENSE_SUFFIX.length) : glAccount;
  return { referencedCurrency: body.slice(FX_PREFIX.length), isSuspense };
}

@Component({
  selector: 'app-response-viewer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './response-viewer.component.html',
  styleUrls: ['./response-viewer.component.scss'],
})
export class ResponseViewerComponent {
  @Input() classification: ClassificationResult | null = null;
  @Input() balance: BalancePreview | null = null;
  @Input() accountEntries: AccountEntry[] | null = null;
  @Input() swiftMessages: SwiftMessage[] | null = null;
  @Input() instructionId: string | null = null;
  /**
   * NOT sent to the microservice — a client-side-computed preview
   * (leg-allocator.component.ts's fxPairs getter, one instance's worth per
   * side), rendered here (not inside <app-leg-allocator> itself) so it reads
   * right after the Settlement Vouchers table it explains, rather than
   * mid-form before any result even exists. See
   * business-case-runner.component.html's [debitFxPairs]/[creditFxPairs]
   * bindings (template reference variables on the two <app-leg-allocator>
   * elements).
   */
  @Input() debitFxPairs: FxPairEntry[] = [];
  @Input() creditFxPairs: FxPairEntry[] = [];

  /**
   * Minor-unit decimal places per currency code, same map business-case-runner.component.ts
   * already fetches from CurrencyService for its own Suspense-equivalent rounding (see its
   * currencyDecimalsMap getter) — bound straight through rather than this (deliberately
   * service-free, @Input()-only) component fetching it again itself. Used only to decide, per
   * currency, how many decimal places "Difference = 0" means in currencyGroups below; falls
   * back to 2 for any currency missing from the map, matching CurrencyService's own fallback.
   */
  @Input() currencyDecimals: Record<string, number> = {};

  /** Settlement Vouchers tab state — Posting View is the default per the UI spec. Switching
   *  tabs is a pure local view-state change: it never touches accountEntries or re-derives
   *  groupedSettlementEntries/settlementEntries, so no accounting entry is ever regenerated. */
  activeSettlementView: 'posting' | 'currency' = 'posting';

  /**
   * Excludes zero-amount entries — a real, economically-null Dr/Cr line a bank voucher would
   * never print. Reachable in practice: onConfirm() (business-case-runner.component.ts) does NOT
   * gate on debitValid/creditValid the way the live preview does, so a real leg can reach the
   * server with amountTxCcy "0.00" (e.g. a Suspense Credit bridge entry that fully offsets a real
   * credit leg — see the "Charge Component Bridge" business case's own note). Such a leg,
   * if its own accountNo happens to literally be "Suspense - Debit"/"Suspense - Credit", would
   * otherwise also get swept into groupedSettlementEntries' "Suspense Clearing" section below
   * (that section's own isSuspenseClearing check matches on glAccount alone, with no way to tell
   * a real caller-submitted leg on that account from a server-generated bridge leg). Filtering
   * here, upstream of both groupedSettlementEntries and currencyGroups, keeps Posting View and
   * Currency View consistent (same source) without touching the authoritative `balance` Input —
   * that's the server's own V8 result over the FULL ledger, unaffected by what this component
   * chooses to display.
   */
  get settlementEntries(): AccountEntry[] {
    return (this.accountEntries ?? []).filter((e) => e.voucherType === 'SETTLEMENT' && Number(e.amount) !== 0);
  }

  /**
   * v1.8.1 — Settlement Vouchers, reordered for audit readability: customer/
   * debit legs, then each FX Exchange pair as one adjacent Dr/Cr block
   * (display-only — the underlying accountEntries/wire response is
   * unchanged), then customer/credit legs, then Suspense clearing last.
   * Purely a client-side re-grouping of settlementEntries; no server or
   * wire-contract change.
   *
   * Pairing/attribution is derived entirely from data already on the wire
   * (glAccount naming + amounts + the inferred transaction currency — the
   * plurality currency across all entries), with one acknowledged edge
   * case: a Suspense-driven FX pair is attributed to "Debit" vs "Credit" by
   * matching its own gross magnitude against the Suspense - Debit /
   * Suspense - Credit clearing entries' own per-currency sums (both are
   * literally the same gross figure — see suspenseBridge.ts's buildFxPair,
   * which reuses it verbatim). If a debitEntries and a creditEntries
   * Suspense bucket in the SAME currency happen to sum to the EXACT same
   * gross amount, both pairs are attributed to "Debit" (a tie, not a
   * crash) — there's no field on the wire that names which list produced
   * a given generated leg, so this is the best available signal. A leg
   * pair's own Debit/Credit attribution has no such ambiguity: it's read
   * directly off the Trx-Ccy-site leg's own drCrIndicator.
   */
  get groupedSettlementEntries(): SettlementSection[] {
    const entries = this.settlementEntries;
    if (!entries.length) return [];

    const isSuspenseClearing = (e: AccountEntry) => e.glAccount === 'Suspense - Debit' || e.glAccount === 'Suspense - Credit';
    const isFx = (e: AccountEntry) => e.glAccount.startsWith(FX_PREFIX);

    const normalDebit = entries.filter((e) => e.drCrIndicator === 'D' && !isFx(e) && !isSuspenseClearing(e));
    const normalCredit = entries.filter((e) => e.drCrIndicator === 'C' && !isFx(e) && !isSuspenseClearing(e));
    const suspenseClearing = entries.filter(isSuspenseClearing);
    const fxEntries = entries.filter(isFx);

    const sumByGlAccount = (glAccount: string): Map<string, number> => {
      const sums = new Map<string, number>();
      for (const e of suspenseClearing) {
        if (e.glAccount !== glAccount) continue;
        sums.set(e.currency, (sums.get(e.currency) ?? 0) + Number(e.amount));
      }
      return sums;
    };
    const suspenseDebitSums = sumByGlAccount('Suspense - Debit');

    // Every FX pair has exactly one leg in the shared transaction currency (the "Trx-Ccy-site")
    // and one in a foreign currency (the "Other-Ccy-site"). The transaction currency itself is
    // defined server-side as debitLegs[0].currency (confirmPaymentInstruction.ts) — and
    // debitLegsInput = [...request.debitLegs, ...bridge.debit] always prepends the caller's own
    // legs, so entries[0] (settlementEntries maps debitLegs first, in order) is ALWAYS
    // request.debitLegs[0], never a generated leg. This is exact, not a heuristic — a plurality/
    // most-common-currency guess would be wrong whenever foreign-currency legs (Other-Ccy-site
    // pairs + Suspense clearing entries) happen to outnumber transaction-currency ones.
    const transactionCurrency = entries[0]!.currency;

    const consumed = new Set<AccountEntry>();
    const pairs: { debit: AccountEntry; credit: AccountEntry }[] = [];
    for (const e of fxEntries) {
      if (consumed.has(e)) continue;
      const parsed = parseFxAccount(e.glAccount);
      const partner = fxEntries.find((p) => {
        if (p === e || consumed.has(p) || p.drCrIndicator === e.drCrIndicator) return false;
        const pParsed = parseFxAccount(p.glAccount);
        return pParsed.isSuspense === parsed.isSuspense && pParsed.referencedCurrency === e.currency && parsed.referencedCurrency === p.currency;
      });
      if (!partner) continue; // defensive — every server-generated FX leg is part of a matched pair
      consumed.add(e);
      consumed.add(partner);
      pairs.push(e.drCrIndicator === 'D' ? { debit: e, credit: partner } : { debit: partner, credit: e });
    }

    const legPairsDebit: AccountEntry[][] = [];
    const legPairsCredit: AccountEntry[][] = [];
    const suspensePairsDebit: AccountEntry[][] = [];
    const suspensePairsCredit: AccountEntry[][] = [];
    for (const { debit, credit } of pairs) {
      const otherCcySite = debit.currency === transactionCurrency ? credit : debit;
      const trxCcySite = otherCcySite === debit ? credit : debit;
      const debitParsed = parseFxAccount(debit.glAccount);
      if (!debitParsed.isSuspense) {
        // Leg pair — the Trx-Ccy-site leg's OWN drCr is the reliable attribution signal.
        (trxCcySite.drCrIndicator === 'D' ? legPairsDebit : legPairsCredit).push([debit, credit]);
      } else {
        // Suspense pair — attribute by matching the Other-Ccy-site's own gross magnitude against
        // the Suspense-Debit/Suspense-Credit clearing sums for this currency.
        const grossAmount = Number(otherCcySite.amount);
        const debitSum = suspenseDebitSums.get(otherCcySite.currency) ?? NaN;
        (Math.abs(grossAmount - debitSum) < 0.005 ? suspensePairsDebit : suspensePairsCredit).push([debit, credit]);
      }
    }

    const sections: SettlementSection[] = [];
    if (normalDebit.length) sections.push({ label: 'Customer / Debit Legs', entries: normalDebit });
    for (const pair of legPairsDebit) sections.push({ label: 'FX Debit Leg Pair', entries: pair });
    for (const pair of suspensePairsDebit) sections.push({ label: 'FX Debit Suspense Pair', entries: pair });
    for (const pair of suspensePairsCredit) sections.push({ label: 'FX Credit Suspense Pair', entries: pair });
    for (const pair of legPairsCredit) sections.push({ label: 'FX Credit Leg Pair', entries: pair });
    if (normalCredit.length) sections.push({ label: 'Settlement / Credit Legs', entries: normalCredit });
    if (suspenseClearing.length) sections.push({ label: 'Suspense Clearing', entries: suspenseClearing });
    return sections;
  }

  /**
   * Currency View — built from the exact same TWO sources Posting View already renders (no
   * accounting entry is ever regenerated or recalculated against the microservice), re-projected
   * by currency instead of by posting sequence/table:
   *
   * 1. groupedSettlementEntries (real AccountEntry objects — the main Settlement Vouchers table).
   * 2. debitFxPairs/creditFxPairs (the client-only "Debit/Credit FX Conversion Pair" overlay —
   *    see this component's own @Input doc comment). Each FX pair has one leg in the transaction
   *    currency and one in the row's own foreign currency (leg-allocator.component.ts's fxPairs
   *    getter) — critically, EVERY real settlement leg whose own currency differs from the
   *    transaction currency carries its full amount in ONE currency only (amountTxCcy is always
   *    transaction-currency-denominated — see groupedSettlementEntries's own doc comment), so
   *    without this overlay that leg's own foreign currency would show up in Currency View with
   *    only one side ever populated — a real leg's own currency without its own Dr/Cr counterpart.
   *
   * (1) and (2) never double-count: the parent (business-case-runner.component.html) always binds
   * debitFxPairs/creditFxPairs through filterFxPairsNettedBySuspense first, which suppresses the
   * overlay entirely for any currency the server already generated a real "FX Exchange ..."
   * settlement leg pair for (source-verified: a real leg pair is only ever server-generated for a
   * currency that also has a matching suspenseBridge entry, and filterFxPairsNettedBySuspense
   * suppresses the overlay for exactly that same currency set) — so a currency is covered by
   * EITHER (1)'s real FX legs OR (2)'s overlay pair, never both. Amounts are still never summed
   * across currencies (each group only ever sums its own currency's own entries).
   *
   * Each row carries an `entryType` = the groupedSettlementEntries section label it came from
   * (e.g. "FX Debit Leg Pair") or, for the overlay, a fixed "Debit FX Conversion Pair"/"Credit FX
   * Conversion Pair" label matching Posting View's own section title for that table. Neither
   * AccountEntry nor FxPairEntry carries an explicit FX-pair/posting-group id on the wire, so
   * entryType is the closest available traceability signal: the two legs of one FX pair, even
   * though they land in different currency groups here, always share the same entryType.
   *
   * Balanced/Unbalanced is decided at the currency's own minor-unit precision (currencyDecimals
   * input, falling back to 2dp) rather than exact floating-point equality, and computed with
   * decimal.js end-to-end — same convention as leg-allocator.component.ts and the microservice's
   * own money.ts — since summing several already-rounded decimal-string amounts as native JS
   * numbers can drift by a binary-float ULP even when every individual amount was correct.
   */
  get currencyGroups(): CurrencyGroup[] {
    const byCurrency = new Map<string, CurrencyViewEntry[]>();
    const push = (currency: string, row: CurrencyViewEntry): void => {
      const rows = byCurrency.get(currency);
      if (rows) rows.push(row);
      else byCurrency.set(currency, [row]);
    };

    for (const section of this.groupedSettlementEntries) {
      for (const e of section.entries) {
        push(e.currency, { drCrIndicator: e.drCrIndicator, glAccount: e.glAccount, amount: e.amount, entryType: section.label, description: e.description ?? '' });
      }
    }
    for (const p of this.debitFxPairs) {
      push(p.currency, { drCrIndicator: p.drCr, glAccount: p.account, amount: String(p.amount), entryType: 'Debit FX Conversion Pair', description: p.site });
    }
    for (const p of this.creditFxPairs) {
      push(p.currency, { drCrIndicator: p.drCr, glAccount: p.account, amount: String(p.amount), entryType: 'Credit FX Conversion Pair', description: p.site });
    }

    return [...byCurrency.keys()].sort().map((currency) => {
      const entries = byCurrency.get(currency)!;
      const dp = this.currencyDecimals[currency] ?? 2;
      const totalDebit = entries.filter((e) => e.drCrIndicator === 'D').reduce((sum, e) => sum.plus(e.amount), new Decimal(0));
      const totalCredit = entries.filter((e) => e.drCrIndicator === 'C').reduce((sum, e) => sum.plus(e.amount), new Decimal(0));
      const difference = totalDebit.minus(totalCredit);
      return {
        currency,
        entries,
        totalDebit: totalDebit.toFixed(dp),
        totalCredit: totalCredit.toFixed(dp),
        difference: difference.toFixed(dp),
        balanced: difference.toDecimalPlaces(dp, Decimal.ROUND_HALF_UP).isZero(),
      };
    });
  }

  get chargeEntries(): AccountEntry[] {
    return (this.accountEntries ?? []).filter((e) => e.voucherType === 'CHARGE');
  }
  get liabilityEntries(): AccountEntry[] {
    return (this.accountEntries ?? []).filter((e) => e.voucherType === 'LIABILITY');
  }
}
