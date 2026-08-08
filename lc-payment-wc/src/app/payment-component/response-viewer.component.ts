import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { AccountEntry, ClassificationResult, SwiftMessage } from './payment-component.types';
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

  get settlementEntries(): AccountEntry[] {
    return (this.accountEntries ?? []).filter((e) => e.voucherType === 'SETTLEMENT');
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

  get chargeEntries(): AccountEntry[] {
    return (this.accountEntries ?? []).filter((e) => e.voucherType === 'CHARGE');
  }
  get liabilityEntries(): AccountEntry[] {
    return (this.accountEntries ?? []).filter((e) => e.voucherType === 'LIABILITY');
  }
}
