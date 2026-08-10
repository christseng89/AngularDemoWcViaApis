import { Component, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { FormlyModule, FormlyFieldConfig, FormlyFormOptions } from '@ngx-formly/core';
import { Observable, Subject, Subscription, merge, of } from 'rxjs';
import { debounceTime, switchMap, catchError, tap, map } from 'rxjs/operators';
import Decimal from 'decimal.js';

import { ResponseViewerComponent } from './response-viewer.component';
import { LegAllocatorComponent, type FxPairEntry } from './leg-allocator.component';
import { SuspenseEntriesComponent, type SuspenseEntry } from './suspense-entries.component';
import { MODULE_GROUPS } from './business-case-registry';
import { buildHeaderFields } from './business-case-fields';
import { buildConfirmRequest } from './business-case-request';
import { PaymentComponentApiService, PaymentComponentApiError } from './payment-component-api.service';
import { CurrencyService } from './currency.service';
import { FxRateService } from './fx-rate.service';
import type { BusinessCaseConfig, ModuleGroup } from './business-case.model';
import type { AccountEntry, AccountType, ClassificationResult, PaymentLegInput, SuspenseBridge, SuspenseBridgeEntry, SwiftMessage } from './payment-component.types';

interface DisplayResult {
  classification: ClassificationResult;
  balance: { debitTotal: string; creditTotal: string; difference: string; balanced: boolean } | null;
  accountEntries: AccountEntry[] | null;
  swiftMessages: SwiftMessage[] | null;
  instructionId: string | null;
  confirmed: boolean;
  /**
   * True when a Confirm click hit an existing (originModule, mainRef,
   * sequence) — the server replayed the ORIGINAL result (FSD §6.1
   * idempotency), NOT a recompute of what's currently in the form. Shown
   * explicitly so a replay is never mistaken for the edited data going
   * unsaved/ignored.
   */
  replay: boolean;
}

@Component({
  selector: 'app-business-case-runner',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, FormlyModule, ResponseViewerComponent, LegAllocatorComponent, SuspenseEntriesComponent],
  templateUrl: './business-case-runner.component.html',
  styleUrls: ['./business-case-runner.component.scss'],
})
export class BusinessCaseRunnerComponent implements OnDestroy {
  readonly moduleGroups: ModuleGroup[] = MODULE_GROUPS;

  selectedModule: string = MODULE_GROUPS[0].module;
  selectedCase: BusinessCaseConfig | null = null;

  form = new FormGroup({});
  model: Record<string, any> = {};
  headerFields: FormlyFieldConfig[] = [];
  options: FormlyFormOptions = {};

  debitLegs: PaymentLegInput[] = [];
  creditLegs: PaymentLegInput[] = [];
  private debitValid = false;
  private creditValid = false;

  /**
   * NG9 fix: `<app-leg-allocator #creditAllocator *ngIf="creditLegsRequired">`'s template
   * reference variable is scoped to that *ngIf's own embedded view — Angular's strict template
   * type-checker (`ng build`/`ng serve`, NOT plain `tsc`, which doesn't compile templates at all
   * and silently misses this) rejects any reference to `creditAllocator` from a sibling element
   * outside that scope, e.g. the <app-response-viewer> binding further down the template that
   * needs its `.fxPairs`. A @ViewChild query isn't subject to that structural-directive scoping
   * restriction — it resolves to undefined while the element is *ngIf-hidden and re-resolves once
   * it reappears, so `creditFxPairs` below can safely read it from anywhere in the template.
   */
  @ViewChild('creditAllocator') creditAllocatorRef?: LegAllocatorComponent;

  /**
   * Same NG9 fix as creditAllocatorRef above, mirrored for the DEBIT side (2026-08-12) —
   * `<app-leg-allocator #debitAllocator *ngIf="debitLegsRequired">` needed this the moment
   * debitLegsRequired started being able to return false (creditLegsBridge case); see
   * debitFxPairs below.
   */
  @ViewChild('debitAllocator') debitAllocatorRef?: LegAllocatorComponent;

  /**
   * NOT FSD-sourced — the Charge Component / Payment Component accounting
   * bridge inputs (<app-suspense-entries>, rendered right under the Unit
   * Code row). Each side may hold multiple entries, each with its own
   * amount + currency — e.g. several Charge-Component commission lines in
   * different currencies. Reset to [] on every selectCase(); NOT part of
   * `model`/`form` (plain component state instead) since these are two
   * independent repeatable lists, not simple Formly scalar fields — see
   * suspense-entries.component.ts's doc comment for why it isn't a Formly
   * `repeat` field either. Read by sideDefaults() (Leg #1 adjustment) and
   * suspenseBridgeLegs() (the actual Cr Suspense - Debit/Credit legs).
   */
  suspenseDebitEntries: SuspenseEntry[] = [];
  suspenseCreditEntries: SuspenseEntry[] = [];

  /** Leg-amount over-precision messages emitted by each <app-leg-allocator> (H-2 client-side guard). */
  debitLegScaleErrors: string[] = [];
  creditLegScaleErrors: string[] = [];

  result: DisplayResult | null = null;
  previewLoading = false;
  previewError: string | null = null;
  /** Shown instead of a stale result while the form is present but not yet complete enough to compute — not an error, just "not ready yet". */
  previewIncomplete = false;
  confirmLoading = false;
  confirmError: string | null = null;

  private previewSub?: Subscription;
  private readonly legsChanged$ = new Subject<void>();

  /**
   * GET /api/fx/rates, cached once (FxRateService itself shareReplay(1)s the
   * HTTP call — see that service's doc comment). Used synchronously inside
   * the sideDefaults() getters below to convert Suspense Debit/Credit into
   * "Trx Equivalent" — the same table <app-leg-allocator> itself uses for its
   * own per-row cross rates, so both stay consistent. Starts as {} before the
   * first emission resolves; crossRate() returning null (pair not in the
   * demo's USD/EUR/JPY/GBP/TWD table, or not loaded yet) falls back to a 1:1
   * rate rather than blocking the getter.
   */
  private fxRates: Record<string, number> = {};

  /**
   * CurrencyService.decimals() — currency-native minor-unit places (JPY=0,
   * USD=2, etc.), used by suspenseAdjustment() below so a
   * cross-currency Suspense entry's FX-equivalent is rounded the SAME way
   * this component computes it and the way the microservice's own
   * minorUnitsForCurrency() (domain/suspenseBridge.ts) rounds it server-side
   * — two independent roundings of "the same" computed amount that disagree
   * even by one minor unit fail the server's exact-equality balance check
   * (409 LEGS_UNBALANCED). Starts as {} before the first emission resolves;
   * decimalsFor() falls back to 2 in that window, same as the service's own
   * fallback for an unknown currency.
   */
  private currencyDecimals: Record<string, number> = {};

  /**
   * Reviewer-requested (see lc-payment-wc/CLAUDE.md, "Single Transaction Currency and Amount as
   * Input Fields") — lets the user directly drive the transaction's own currency/amount instead
   * of only ever reading them off the selected case's registry defaults / the live debit leg.
   * `null` means "no override yet" — transactionCurrency/baseTotalAmount (below) and
   * sideDefaults() all fall back to today's exact pre-existing derivation in that state, so every
   * one of the 23 registry cases behaves byte-for-byte as before until the user actually edits
   * these fields. Reset to null on every selectCase() (business-case-runner.component.ts,
   * matching suspenseDebitEntries/suspenseCreditEntries's own per-case reset) so a freshly-picked
   * case always starts from its own defaults, never a leaked override from a previous case.
   * amountOverride is a decimal STRING (not number) for the same reason SuspenseEntry.amount is —
   * see suspense-entries.component.ts's emit() doc comment on NumberValueAccessor.
   */
  transactionCurrencyOverride: string | null = null;
  transactionAmountOverride: string | null = null;

  /** "Get Currency API" (currency.service.ts) — populates the new Transaction Currency <select> below, same source leg-allocator.component.ts / suspense-entries.component.ts already use for their own currency dropdowns. */
  readonly currencies$: Observable<string[]>;

  constructor(private readonly api: PaymentComponentApiService, currency: CurrencyService, private readonly fx: FxRateService) {
    currency.decimals().subscribe((decimals) => {
      this.currencyDecimals = decimals;
    });
    this.currencies$ = currency.codes();
    fx.rates().subscribe((rates) => {
      this.fxRates = rates;
    });
  }

  private decimalsFor(currency: string): number {
    return this.currencyDecimals[currency] ?? 2;
  }

  /** Exposes the same currencyDecimals map decimalsFor() uses, for <app-response-viewer>'s
   *  Currency View to decide per-currency Balanced/Unbalanced precision — reuses this
   *  component's own CurrencyService subscription rather than the (deliberately
   *  service-free) response-viewer component fetching it again itself. */
  get currencyDecimalsMap(): Record<string, number> {
    return this.currencyDecimals;
  }

  /**
   * H-2 companion — CLIENT-SIDE input guard. Number of fractional digits in a
   * user-entered amount (mirrors the microservice's own money.ts decimalPlaces()
   * so the UI catches over-precision at input time instead of only surfacing it
   * as a server 400 on preview/Confirm). "100.123" -> 3, "100" -> 0.
   */
  private decimalPlaces(value: string): number {
    const s = String(value);
    const dot = s.indexOf('.');
    return dot === -1 ? 0 : s.length - dot - 1;
  }

  /**
   * Every currently-entered amount whose decimal places exceed what its currency
   * allows (CurrencyService.decimals() — the "Get Currency API": JPY/TWD/IDR = 0,
   * USD/EUR = 2, …). Covers the two runner-owned inputs the user can over-type:
   * the header Total Amount (checked against the transaction currency) and each
   * Suspense Debit/Credit entry (checked against its OWN currency). A currency
   * absent from the decimals map (unknown, or not loaded yet) is skipped — same
   * "source of truth is the Currency API, don't invent a limit" posture as the
   * microservice's knownMinorUnitsForCurrency(). Empty amounts are skipped
   * (still being typed). A debitLegsBridge or creditLegsBridge case's Total Amount is
   * auto-derived / read-only, never user-typed, so it isn't checked here.
   */
  get amountScaleErrors(): string[] {
    const errs: string[] = [];
    const check = (label: string, amount: string, currency: string): void => {
      if (amount === '' || amount === null || amount === undefined) return;
      const max = this.currencyDecimals[currency];
      if (max === undefined) return; // unknown / not yet loaded — Currency API is the source of truth
      const dp = this.decimalPlaces(amount);
      if (dp > max) {
        errs.push(`${label} ${amount} has ${dp} decimal place(s) but ${currency} allows at most ${max}.`);
      }
    };
    if (!this.selectedCase?.debitLegsBridge && !this.selectedCase?.creditLegsBridge && this.transactionAmountOverride !== null) {
      check('Total Amount', this.transactionAmountOverride, this.transactionCurrency);
    }
    this.suspenseDebitEntries.forEach((e) => check('Suspense Debit', e.amount, e.currency));
    this.suspenseCreditEntries.forEach((e) => check('Suspense Credit', e.amount, e.currency));
    return errs;
  }

  /** Leg-amount over-precision reported by the two <app-leg-allocator>s (via scaleErrorsChange). */
  get legAmountScaleErrors(): string[] {
    return [...this.debitLegScaleErrors, ...this.creditLegScaleErrors];
  }

  /** Every over-precision error across the header Total Amount, Suspense entries, AND leg allocators. */
  get allAmountScaleErrors(): string[] {
    return [...this.amountScaleErrors, ...this.legAmountScaleErrors];
  }

  get hasAmountScaleError(): boolean {
    return this.allAmountScaleErrors.length > 0;
  }

  get casesForSelectedModule(): BusinessCaseConfig[] {
    return this.moduleGroups.find((g) => g.module === this.selectedModule)?.cases ?? [];
  }

  /**
   * Shown once, right under the Unit Code row (business-case-runner.component.html) —
   * NOT repeated inside either <app-leg-allocator> (see that component's
   * showTotalAmount input).
   *
   * Prefers the LIVE first debit leg's own currency (this.debitLegs[0].currency)
   * over the case's static registry default, matching the microservice's own
   * definition of "transaction currency" exactly (confirmPaymentInstruction.ts:
   * `(request.debitLegs[0] ?? request.creditLegs[0])!.currency` — see
   * payment-instructions-post.yaml's SuspenseEntry doc comment). This matters because
   * <app-leg-allocator> lets the user change a debit leg's own currency (its "Transaction
   * Currency" dropdown / a row's own currency select) independently of this component —
   * falling back to the registry default here after that edit would silently
   * disagree with what the server actually treats as the transaction currency,
   * misclassifying a Suspense entry in that SAME (now-changed) currency as
   * cross-currency and applying an FX conversion that shouldn't happen (a real
   * bug: a same-currency Suspense entry generating a fractional balance
   * mismatch). Falls back to the registry default only before the allocator
   * has emitted anything yet (initial render, no case, etc.) — by construction
   * every case in the registry already has sum(debit defaults) === sum(credit
   * defaults) (V8 requires it) at that point, so DEBIT is a safe arbitrary
   * canonical source.
   *
   * creditLegsBridge fallback (2026-08-12): debitLegs and the registry's own DEBIT leg spec are
   * BOTH permanently absent for a creditLegsBridge case (no Debit Leg at all, by the flag's own
   * contract) — falls through to this.creditLegs[0]?.currency, then the registry's CREDIT leg
   * spec, mirroring the server's own debitLegs[0] ?? creditLegs[0] fallback so this getter never
   * silently disagrees with what confirmPaymentInstruction.ts actually derives. Deliberately
   * GATED on `this.selectedCase?.creditLegsBridge` rather than applied unconditionally whenever
   * debitLegs happens to be empty: for an ORDINARY case, an empty debitLegs is just a normal
   * transient state (initial render, still typing) that says nothing about which currency is
   * authoritative — falling back to creditLegs[0] there would be reading state for the wrong
   * reason, not a genuine "debit side doesn't exist in this mode" signal the way it is for
   * creditLegsBridge. (The server-side equivalent doesn't need this gate because schema
   * validation already guarantees debitLegs is empty ONLY when creditLegsComponentBridge is
   * true by the time confirmPaymentInstruction.ts ever sees the request — this component's own
   * debitLegs/creditLegs have no such guarantee mid-edit.)
   *
   * transactionCurrencyOverride (above) takes priority over all of this when set — the user
   * explicitly typing a Transaction Currency is a stronger signal than any derivation.
   */
  get transactionCurrency(): string {
    const isCreditLegsBridge = !!this.selectedCase?.creditLegsBridge;
    return (
      this.transactionCurrencyOverride ??
      this.debitLegs[0]?.currency ??
      (isCreditLegsBridge ? this.creditLegs[0]?.currency : undefined) ??
      this.selectedCase?.legs.find((l) => l.side === 'DEBIT')?.defaultCurrency ??
      (isCreditLegsBridge ? this.selectedCase?.legs.find((l) => l.side === 'CREDIT')?.defaultCurrency : undefined) ??
      'USD'
    );
  }
  /**
   * Debit Legs Component Bridge Flag (2026-08-09, business-requirement-confirmed): for a debitLegsBridge case,
   * Transaction Amount is NOT this free-typed/registry-default base at all — it's PROTECTED
   * (read-only, see onTransactionAmountInput below and the template's [readOnly] binding) and
   * derived entirely as Σ(Suspense Credit entries' Trx Ccy Equivalent), matching the balance
   * principle "Total Debit Legs = Total Suspense Credit" (lc-payment-wc/CLAUDE.md, "Charge
   * Component <-> Payment Component boundary"). Delegates to debitDefaults.totalAmount
   * (sideDefaults('DEBIT') below) rather than re-deriving the same sum a second time — see
   * suspenseAdjustment()'s own doc comment on why a second independent implementation of "the
   * same" math is exactly the class of bug this file keeps finding.
   *
   * Credit Legs Component Bridge Flag (2026-08-12) — the mirror image: for a creditLegsBridge
   * case, the REAL leg is the CREDIT side (e.g. Nostro settlement), so Transaction Amount
   * derives from creditDefaults.totalAmount (sideDefaults('CREDIT') below) instead — Σ(Suspense
   * Debit entries' Trx Ccy Equivalent), matching "Total Credit Legs = Total Suspense Debit".
   */
  get baseTotalAmount(): number {
    if (this.selectedCase?.debitLegsBridge) {
      return Number(this.debitDefaults.totalAmount);
    }
    if (this.selectedCase?.creditLegsBridge) {
      return Number(this.creditDefaults.totalAmount);
    }
    const debitLegs = this.selectedCase?.legs.filter((l) => l.side === 'DEBIT') ?? [];
    return this.overriddenOrDefaultAmount(debitLegs.reduce((sum, l) => sum + (Number(l.defaultAmountTxCcy) || 0), 0));
  }

  /** transactionAmountOverride (above) takes priority over `defaultAmount` when set. Shared by baseTotalAmount and sideDefaults() so both sides of a case seed from the identical effective total. */
  private overriddenOrDefaultAmount(defaultAmount: number): number {
    return this.transactionAmountOverride !== null ? Number(this.transactionAmountOverride) || 0 : defaultAmount;
  }

  onTransactionCurrencyInput(value: string): void {
    this.transactionCurrencyOverride = value || null;
    this.legsChanged$.next();
  }

  /**
   * `value` arrives as a JS number (or null when the field is cleared) via Angular's
   * NumberValueAccessor for `input[type=number]` — see suspense-entries.component.ts's emit()
   * doc comment for why the stored override is normalized back to a string. Clearing the field
   * (null) reverts to the case's own registry-derived default rather than pinning it at 0.
   *
   * Debit Legs Component Bridge Flag: Transaction Amount is PROTECTED (read-only) for a debitLegsBridge case —
   * it's derived from Σ Suspense Credit, never user-typed (see baseTotalAmount/sideDefaults('DEBIT')
   * above). Credit Legs Component Bridge Flag (2026-08-12): same protection, mirrored, for a
   * creditLegsBridge case — derived from Σ Suspense Debit (sideDefaults('CREDIT')). The template
   * already sets [readOnly] on the input for either case; this guard is defense-in-depth against
   * any path that could still fire a (ngModelChange) here (e.g. a readonly input still emits on
   * programmatic value changes in some browsers).
   */
  onTransactionAmountInput(value: number | null): void {
    if (this.selectedCase?.debitLegsBridge || this.selectedCase?.creditLegsBridge) return;
    this.transactionAmountOverride = value === null || value === undefined || Number.isNaN(value) ? null : String(value);
    this.legsChanged$.next();
  }

  /**
   * NOT FSD-sourced — resolves the SAME crossRate value that ends up on the
   * wire (buildSuspenseBridgeEntries() below sends `rate.toFixed(6)`) so this
   * component's own Leg #1 seeding computation and the request it actually
   * sends never disagree about which rate was used for "the same" entry.
   * Both call sites already guard on entry.currency !== trxCurrency before
   * calling this — no same-currency short-circuit needed here.
   */
  private resolveCrossRate(entry: SuspenseEntry, trxCurrency: string): number {
    const rate = this.fx.crossRate(this.fxRates, entry.currency, trxCurrency) ?? 1;
    return Number(rate.toFixed(6));
  }

  /**
   * v1.7.4 — REVERTS v1.7.3's attempt to combine a foreign-currency Suspense
   * bucket with any matching-currency real Payment Leg before converting.
   * That combining logic was based on a misdiagnosis: it targeted a genuine
   * PER-CURRENCY display gap (summing settlement legs by their own shown
   * Currency column can be off by a minor unit — confirmed: a real EUR 100
   * leg's own client-computed trx-equivalent, 108.31 via division by the
   * leg-allocator's own rate, does not exactly equal "the combined FX pair's
   * trx-equivalent minus the Suspense leg's own trx-equivalent" once both
   * rates are independently resolved and rounded to 6dp — 0.923295 and
   * 1.083077 are NOT exact reciprocals). But fixing THAT by seeding this
   * side's total against a Combined_C-converted magnitude instead breaks
   * the check the server actually ENFORCES: aggregate V8
   * (Σ debitLegs[].amountTxCcy === Σ creditLegs[].amountTxCcy, exact,
   * request-blocking on mismatch — balanceValidation.ts). Proved by a full
   * end-to-end trace with a real Payment Leg (EUR 100, client trx-equivalent
   * 108.31) alongside a Suspense Credit EUR 200 (server trx-equivalent
   * 216.62) and their combined FX pair (trx-equivalent 324.92 — cancels
   * itself out of V8 regardless, always): the v1.7.3 seed produced a
   * remainder that satisfied the per-currency USD check (9675.08) but
   * FAILED aggregate V8 by exactly 0.01 (10324.93 credit vs 10324.92 debit)
   * — i.e. v1.7.3 would have caused a real 409 LEGS_UNBALANCED in exactly
   * the scenario it was meant to fix. The pre-v1.7.3 gross-only seed
   * (9675.07) is what the server itself already produces and accepts — it
   * satisfies aggregate V8 exactly, because the FX pair's two generated
   * legs always carry the identical trx-equivalent value on opposite sides
   * (cancels out of the aggregate sum unconditionally), so this side's own
   * total only ever needs to offset the Suspense entries' OWN independently
   * rounded trx-equivalents — never a live leg's. The per-currency display
   * gap this was chasing is a real, but SEPARATE and not seed-fixable,
   * artifact of the leg-allocator's own per-row FX rate (from
   * onAccountAmountInput, division) not being an exact 6dp reciprocal of
   * the Suspense bridge's own crossRate (from resolveCrossRate,
   * multiplication) — eliminating it would mean making every foreign-
   * currency leg and every Suspense entry in the same currency resolve to
   * one shared, single-direction rate, a materially bigger change than a
   * seed-formula fix and out of scope here.
   *
   * Converts PER ENTRY (not per currency-bucket) to mirror
   * domain/suspenseBridge.ts's buildSuspenseBridgeLeg exactly, which rounds
   * each entry's own trx-equivalent independently — summing bucket-first
   * then rounding once could disagree from the server's per-entry sum by a
   * minor unit when a currency has more than one entry.
   *
   * Accumulates via Decimal, not a plain JS number: each entry's
   * trxEquivalent is already rounded to `scale` places (money.ts/
   * suspenseBridge.ts's own convention), but SUMMING already-rounded
   * decimal values as IEEE-754 doubles can still land one ULP off the
   * canonical decimal sum (e.g. 100.1 + 100.2 → 200.29999999999998, not
   * 200.3) — invisible most of the time, but exactly the kind of thing
   * that turns into a real 0.01 display/wire mismatch once String()'d.
   * Staying in Decimal until sideDefaults() does its own final rounding
   * avoids ever converting an intermediate (unrounded-relative-to-the-
   * running-total) value to a binary double.
   */
  private suspenseAdjustment(side: 'DEBIT' | 'CREDIT', entries: readonly SuspenseEntry[], trxCurrency: string): Decimal {
    let total = new Decimal(0);
    for (const entry of entries) {
      const amount = Number(entry.amount) || 0;
      if (amount === 0 || !entry.currency) continue; // blank/incomplete row — matches buildSuspenseBridgeEntries()'s own skip

      let trxEquivalent: Decimal;
      if (entry.currency === trxCurrency) {
        // Mirrors buildSuspenseBridgeLeg's same-currency pass-through: no conversion, no rounding.
        trxEquivalent = new Decimal(amount);
      } else {
        const rate = this.resolveCrossRate(entry, trxCurrency);
        const scale = this.decimalsFor(trxCurrency);
        trxEquivalent = new Decimal(amount).times(rate).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
      }
      total = side === 'DEBIT' ? total.plus(trxEquivalent) : total.minus(trxEquivalent);
    }
    return total;
  }

  /**
   * Debit Leg #1 / Credit Leg #1 seed amount — feeds <app-leg-allocator
   * [initialTotalAmount]>, which only ever seeds/reset()s a single 100% row
   * (Leg #1); any further %-split the user does inside the allocator is
   * unaffected by this (per the user's own framing: "Debit Leg #1 / Credit
   * Leg #1 才做 % 控制"). The case's own Total Amount (baseTotalAmount
   * above) is NEVER itself modified — only this derived, adjusted value is.
   * See suspenseAdjustment() above: "Total ± Σ Suspense entries, each
   * converted independently at its own crossRate" — deliberately blind to
   * any live leg in the same currency (v1.7.4; see that method's doc
   * comment for why combining with a live leg, tried in v1.7.3, broke
   * aggregate V8 instead of fixing anything).
   *
   * The conversion/comparison target MUST be `this.transactionCurrency`
   * (the LIVE getter, derived from the actual first debit leg) — NOT this
   * side's own registry-default `currency` below. Regression: those two used
   * to diverge whenever the user changed the debit leg's own currency after
   * a Suspense entry was already in EUR — sideDefaults() kept converting
   * against the stale registry default (e.g. USD) while
   * buildSuspenseBridgeEntries() (and the server) had already moved on to
   * the live currency, so the client's own seeded Leg #1 amount silently
   * disagreed with what actually got sent on the wire for "the same" entry,
   * producing a real (if small) 409 LEGS_UNBALANCED. `currency` below is
   * still the right value for the row's own SEEDED currency label
   * (`initialCurrency`) — only the conversion target changes.
   *
   * transactionAmountOverride/transactionCurrencyOverride, when set, take priority over the
   * case's own registry legs for BOTH sides equally (baseTotalAmount and currency below) — a
   * single Transaction Currency/Amount pair is meant to seed both Leg #1s identically, same as
   * every registry case's own debit/credit defaults already agree by construction (V8).
   *
   * Debit Legs Component Bridge Flag exception (2026-08-09, business-requirement-confirmed): the above
   * "base ± Σ Suspense" model does NOT apply to a debitLegsBridge case's DEBIT side. There is no
   * real Credit Leg to reduce and no registry base amount to seed from — the Debit Leg total
   * (== the case's own Transaction Amount, see baseTotalAmount getter above) is computed
   * DIRECTLY as Σ(Suspense Credit entries' Trx Ccy Equivalent), full stop. Reuses
   * suspenseAdjustment('DEBIT', ...) purely for its ADDING sign convention — the entries passed
   * are Suspense CREDIT, not Suspense Debit; Suspense Debit is not applicable in this mode and
   * has no UI to populate it (business-case-runner.component.html hides it entirely for a
   * debitLegsBridge case), so suspenseDebitEntries stays permanently [] and never needs its own
   * branch here.
   *
   * Credit Legs Component Bridge Flag exception (2026-08-12) — the mirror image, for a
   * creditLegsBridge case's CREDIT side: no real Debit Leg to reduce, no registry base amount to
   * seed from — the Credit Leg total is computed DIRECTLY as Σ(Suspense Debit entries' Trx Ccy
   * Equivalent). Reuses suspenseAdjustment('DEBIT', ...) for the same reason the debitLegsBridge
   * branch does — purely its ADDING sign convention, applied here to suspenseDebitEntries
   * (suspenseCreditEntries is not applicable in this mode and has no UI to populate it, hidden
   * entirely in business-case-runner.component.html for a creditLegsBridge case).
   */
  private sideDefaults(side: 'DEBIT' | 'CREDIT') {
    const legs = this.selectedCase?.legs.filter((l) => l.side === side) ?? [];
    const currency = this.transactionCurrencyOverride ?? legs[0]?.defaultCurrency ?? 'USD';
    const trxCurrency = this.transactionCurrency;

    let totalAmount: Decimal;
    if (this.selectedCase?.debitLegsBridge && side === 'DEBIT') {
      totalAmount = this.suspenseAdjustment('DEBIT', this.suspenseCreditEntries, trxCurrency);
    } else if (this.selectedCase?.creditLegsBridge && side === 'CREDIT') {
      totalAmount = this.suspenseAdjustment('DEBIT', this.suspenseDebitEntries, trxCurrency);
    } else {
      const baseTotalAmount = this.overriddenOrDefaultAmount(legs.reduce((sum, l) => sum + (Number(l.defaultAmountTxCcy) || 0), 0));
      const adjustment =
        side === 'DEBIT'
          ? this.suspenseAdjustment('DEBIT', this.suspenseDebitEntries, trxCurrency)
          : this.suspenseAdjustment('CREDIT', this.suspenseCreditEntries, trxCurrency);
      totalAmount = new Decimal(baseTotalAmount).plus(adjustment);
    }
    // Decimal end-to-end, one final rounding pass (matching leg-allocator's own money()/
    // ensureRemainderRow convention) — see suspenseAdjustment()'s doc comment for why summing
    // already-rounded plain-number trxEquivalents risked a binary-float ULP drift here.
    totalAmount = totalAmount.toDecimalPlaces(this.decimalsFor(trxCurrency), Decimal.ROUND_HALF_UP);

    return {
      totalAmount: totalAmount.isZero() ? '0' : String(totalAmount.toNumber()),
      currency,
      accountType: legs[0]?.defaultAccountType ?? ('CUSTOMER' as AccountType),
      rtgsIndicator: legs[0]?.defaultRtgsIndicator ?? false,
      accountNo: legs[0]?.defaultAccountNo ?? '',
      accountTypeOptions: legs[0]?.accountTypeOptions ?? (['CUSTOMER', 'NOSTRO', 'VOSTRO', 'SUSPENSE', 'INTERNAL'] as AccountType[]),
    };
  }

  get debitDefaults() {
    return this.sideDefaults('DEBIT');
  }
  get creditDefaults() {
    return this.sideDefaults('CREDIT');
  }

  /**
   * v1.4.0 — the Charge Component / Payment Component accounting bridge's
   * balancing algorithm (bridge legs + FX Exchange pair legs) now lives
   * server-side (microservices/payment-component/src/domain/suspenseBridge.ts,
   * ported 1:1 from this component's own former suspenseBridgeLeg()/
   * fxExchangePairLegs()/suspenseBridgeLegs()). This component's remaining
   * job is just building the wire-level SuspenseBridge request field: one
   * raw {amount, currency, crossRate?} entry per non-blank/non-zero row,
   * resolving crossRate the same way sideDefaults()/applyFxRate() do
   * elsewhere in this file (GET /api/fx/rates via FxRateService, falling
   * back to a 1:1 rate rather than blocking when the pair isn't in the
   * demo's table). See PaymentInstructionConfirmRequest.suspenseBridge's
   * doc comment (payment-component.types.ts) for what the SERVER does and
   * does NOT adjust — sideDefaults() above still owns the caller-side
   * "Total ± Σ entries" pre-adjustment the server relies on.
   */
  private buildSuspenseBridgeEntries(entries: readonly SuspenseEntry[]): SuspenseBridgeEntry[] {
    const trxCurrency = this.transactionCurrency;
    const result: SuspenseBridgeEntry[] = [];
    for (const entry of entries) {
      const amount = Number(entry.amount) || 0;
      if (amount === 0 || !entry.currency) continue; // blank/incomplete row — not ready to send yet
      const wireEntry: SuspenseBridgeEntry = { amount: entry.amount, currency: entry.currency, sourceComponent: entry.sourceComponent };
      if (entry.currency !== trxCurrency) {
        // Same resolveCrossRate() as suspenseAdjustment() above — this component's own
        // Leg #1 seeding and the rate actually sent on the wire must always agree.
        wireEntry.crossRate = this.resolveCrossRate(entry, trxCurrency).toFixed(6);
      }
      result.push(wireEntry);
    }
    return result;
  }

  /**
   * v1.7.0 fix — the "Debit/Credit FX Conversion Pair" panel
   * (leg-allocator.component.ts's fxPairs getter) is a NAIVE, suspense-
   * unaware calculation: for any row whose own currency differs from the
   * transaction currency, it unconditionally shows "this row's full amount
   * needs converting" — correct for its documented purpose (SSSS_PaymentDebit.js
   * posts one entry per leg only, so a foreign-currency leg's own currency
   * would otherwise never balance) ONLY when nothing else offsets that
   * currency. Since v1.7.0, a Suspense entry in the SAME currency (on the
   * SAME side) may already net that exposure down to zero — or to some
   * smaller/differently-directed amount — server-side
   * (domain/suspenseBridge.ts's buildNetFxExchangePairLegs); the SETTLEMENT
   * VOUCHERS table (this component's own `result.accountEntries`) already
   * reflects whatever the server actually did (no extra legs at all when
   * net=0, or real "FX Exchange ..." SETTLEMENT entries when net≠0).
   * Showing the leg-allocator's OWN unconditional per-row conversion
   * ALONGSIDE that is therefore either redundant (net≠0 — the real
   * conversion is already visible in Settlement Vouchers) or actively wrong
   * (net=0 — implies a conversion that never happened). Rather than
   * re-deriving the server's net amount here too (a second independent
   * implementation of the same math — exactly the class of bug this
   * session keeps finding), this simply SUPPRESSES the naive pair for any
   * currency that has at least one Suspense entry on the matching side —
   * the server's own response is the one authoritative source for what
   * happens to that currency. A foreign-currency leg with NO suspense
   * entry in its currency is untouched: the panel still shows the naive
   * conversion for it, exactly as before v1.7.0.
   *
   * Debit Legs Component Bridge Flag exception (2026-08-09, business-requirement-confirmed;
   * simplified 2026-08-11 from a per-currency net to an unconditional hide — see below) — the
   * SAME-side assumption above ("a Suspense entry on the SAME side nets a leg's exposure") never
   * held for a debitLegsBridge case in the first place: its real legs sit on the DEBIT side, but
   * the netting source is the Suspense CREDIT bridge (domain/suspenseBridge.ts's
   * debitLegsComponentBridge diff-sized pair, microservice side). An earlier version (2026-08-09)
   * called this method with `suspenseCreditEntries` instead of `suspenseDebitEntries` to net
   * per-currency against that Suspense-side data — but that still left a gap: a debit leg whose
   * OWN currency happens to have NO matching Suspense Credit entry (a perfectly normal split — the
   * whole point of this bridge is the debit side funding one or more Suspense buckets, not
   * necessarily currency-for-currency) would fall through un-suppressed, showing a misleading
   * naive pair even though the server-side diff-sized-pair logic is the only authoritative source
   * of what actually needs converting in this mode. Business-requirement-confirmed (2026-08-11):
   * this panel is simply not needed at all for a debitLegsBridge case — the debitFxPairs getter
   * below returns `[]` directly whenever `sc.debitLegsBridge` is true, bypassing this method
   * entirely rather than computing a partial per-currency filter (moved from an inline template
   * expression to a getter 2026-08-12, when debitAllocator itself became conditionally rendered —
   * see debitAllocatorRef's own doc comment). Same suppress-don't-recompute philosophy as the rest
   * of this method: the Settlement Vouchers table already reflects the server's own (diff-sized,
   * possibly zero) FX Exchange entries for every currency, in every scenario — this panel has
   * nothing left to add in this mode. creditFxPairs below applies the exact mirror-image
   * unconditional hide for a creditLegsBridge case, for the same reason on the opposite side.
   */
  filterFxPairsNettedBySuspense(pairs: readonly FxPairEntry[], suspenseEntries: readonly SuspenseEntry[]): FxPairEntry[] {
    const suspenseCurrencies = new Set(suspenseEntries.map((e) => e.currency));
    const rowCurrencyOf = (p: FxPairEntry): string => (p.site === 'Other Ccy' ? p.currency : p.account.replace('FX Exchange ', ''));
    return pairs.filter((p) => !suspenseCurrencies.has(rowCurrencyOf(p)));
  }

  /** Returns undefined (field omitted entirely) when neither list has any complete entry. */
  private buildSuspenseBridge(): SuspenseBridge | undefined {
    const debitEntries = this.buildSuspenseBridgeEntries(this.suspenseDebitEntries);
    const creditEntries = this.buildSuspenseBridgeEntries(this.suspenseCreditEntries);
    if (debitEntries.length === 0 && creditEntries.length === 0) return undefined;

    const bridge: SuspenseBridge = {};
    if (debitEntries.length > 0) bridge.debitEntries = debitEntries;
    if (creditEntries.length > 0) bridge.creditEntries = creditEntries;
    return bridge;
  }

  onDebitLegsChange(legs: PaymentLegInput[]): void {
    this.debitLegs = legs;
    this.legsChanged$.next();
  }
  onCreditLegsChange(legs: PaymentLegInput[]): void {
    this.creditLegs = legs;
    this.legsChanged$.next();
  }
  onDebitValidChange(valid: boolean): void {
    this.debitValid = valid;
  }
  onCreditValidChange(valid: boolean): void {
    this.creditValid = valid;
  }

  /**
   * False when the selected case's Debit Legs Component Bridge Flag (BusinessCaseConfig.debitLegsBridge — see
   * that field's own doc comment for the full contract) is set — i.e. the Payment Component is
   * being used purely as a funding/settlement bridge to a separate Charge Component, and never
   * generates the final charge credit legs itself. Reads the flag directly rather than inferring
   * it from `legs`' shape, so a case's UI behavior is driven by an explicit, self-documenting
   * signal instead of a structural coincidence. Drives whether <app-leg-allocator side="CREDIT">
   * is rendered at all (business-case-runner.component.html) — when it isn't, creditLegs stays
   * at its initial [] and creditValid is seeded true in selectCase() below, since nothing will
   * ever emit validChange for a side with no allocator.
   */
  get creditLegsRequired(): boolean {
    return !!this.selectedCase && !this.selectedCase.debitLegsBridge;
  }

  /**
   * Mirror of creditLegsRequired above (2026-08-12) — false when the selected case's Credit Legs
   * Component Bridge Flag (BusinessCaseConfig.creditLegsBridge) is set — i.e. the Payment
   * Component is being used purely as a settlement bridge FROM a separate upstream component
   * (e.g. a Loan Component), and never generates the debit legs itself. Drives whether
   * <app-leg-allocator side="DEBIT"> is rendered at all — when it isn't, debitLegs stays at its
   * initial [] and debitValid is seeded true in selectCase() below, since nothing will ever emit
   * validChange for a side with no allocator.
   */
  get debitLegsRequired(): boolean {
    return !!this.selectedCase && !this.selectedCase.creditLegsBridge;
  }

  /**
   * Template-safe replacement for referencing `creditAllocator.fxPairs` directly in
   * <app-response-viewer>'s binding — see creditAllocatorRef's own doc comment for why that
   * template reference variable can't be read from outside its *ngIf scope. Falls back to []
   * when the allocator isn't currently rendered (debitLegsBridge case, or ViewChild not yet
   * resolved), matching what <app-response-viewer>'s [creditFxPairs] always defaulted to anyway.
   * creditLegsBridge full-hide (2026-08-12, matching the 2026-08-11 debitFxPairs lesson below):
   * suspenseCreditEntries stays permanently [] for a creditLegsBridge case (Suspense Credit is
   * hidden from the UI entirely in that mode), so netting against it would be netting against an
   * always-empty list — the exact bug debitFxPairs already fixed for the mirror-image case.
   * Hidden unconditionally instead, before even checking creditLegsRequired/creditAllocatorRef.
   */
  get creditFxPairs(): FxPairEntry[] {
    if (this.selectedCase?.creditLegsBridge) return [];
    if (!this.creditLegsRequired || !this.creditAllocatorRef) return [];
    return this.filterFxPairsNettedBySuspense(this.creditAllocatorRef.fxPairs, this.suspenseCreditEntries);
  }

  /**
   * Debit-side mirror of creditFxPairs above (2026-08-12) — template-safe replacement for
   * referencing `debitAllocator.fxPairs` directly, now that the DEBIT allocator can also be
   * conditionally hidden (*ngIf="debitLegsRequired", creditLegsBridge case) via debitAllocatorRef.
   * Also carries the existing debitLegsBridge full-hide (2026-08-11 business-requirement-confirmed
   * — the "Debit FX Conversion Pair" panel is not needed at all for that case), moved here from
   * the old inline template expression (`sc.debitLegsBridge ? [] : filterFxPairsNettedBySuspense(
   * debitAllocator.fxPairs, suspenseDebitEntries)`) now that debitAllocator can no longer be
   * referenced directly from the template outside its own *ngIf scope.
   */
  get debitFxPairs(): FxPairEntry[] {
    if (this.selectedCase?.debitLegsBridge) return [];
    if (!this.debitLegsRequired || !this.debitAllocatorRef) return [];
    return this.filterFxPairsNettedBySuspense(this.debitAllocatorRef.fxPairs, this.suspenseDebitEntries);
  }

  onSuspenseDebitEntriesChange(entries: SuspenseEntry[]): void {
    this.suspenseDebitEntries = entries;
    this.legsChanged$.next();
  }
  onSuspenseCreditEntriesChange(entries: SuspenseEntry[]): void {
    this.suspenseCreditEntries = entries;
    this.legsChanged$.next();
  }

  onDebitLegScaleErrorsChange(errors: string[]): void {
    this.debitLegScaleErrors = errors;
  }
  onCreditLegScaleErrorsChange(errors: string[]): void {
    this.creditLegScaleErrors = errors;
  }

  selectModule(module: string): void {
    this.selectedModule = module;
    this.selectCase(null);
  }

  selectCase(businessCase: BusinessCaseConfig | null): void {
    this.previewSub?.unsubscribe();
    this.previewSub = undefined;

    this.selectedCase = businessCase;
    this.result = null;
    this.previewError = null;
    this.previewIncomplete = false;
    this.confirmError = null;
    this.debitLegs = [];
    this.creditLegs = [];
    // Vacuously true when the Credit Legs Component Bridge Flag is set (debitLegsRequired above,
    // 2026-08-12) — no <app-leg-allocator side="DEBIT"> will exist to ever emit a real
    // validChange otherwise, which would leave debitValid permanently false and block the live
    // preview forever. Mirror of creditValid's own seeding below.
    this.debitValid = businessCase ? !!businessCase.creditLegsBridge : false;
    // Vacuously true when the Debit Legs Component Bridge Flag is set (creditLegsRequired above) — no
    // <app-leg-allocator side="CREDIT"> will exist to ever emit a real validChange otherwise,
    // which would leave creditValid permanently false and block the live preview forever.
    this.creditValid = businessCase ? !!businessCase.debitLegsBridge : false;
    this.suspenseDebitEntries = [];
    this.suspenseCreditEntries = [];
    this.debitLegScaleErrors = [];
    this.creditLegScaleErrors = [];
    this.transactionCurrencyOverride = null;
    this.transactionAmountOverride = null;
    this.model = {};
    this.form = new FormGroup({});
    this.headerFields = businessCase ? buildHeaderFields(businessCase) : [];

    if (businessCase && businessCase.verdict !== 'N_A') {
      // Formly field edits AND leg-allocator edits both trigger the same debounced recompute.
      this.previewSub = merge(this.form.valueChanges.pipe(map(() => undefined)), this.legsChanged$)
        .pipe(
          debounceTime(400),
          switchMap(() => this.runPreview(businessCase)),
        )
        .subscribe();
    }
  }

  onConfirm(): void {
    if (!this.selectedCase || this.selectedCase.verdict !== 'PASS') return;
    // H-2 client-side guard: never POST an over-precise amount (the server would 409/400 it anyway).
    if (this.hasAmountScaleError) {
      this.confirmError = 'Fix amount precision before confirming — ' + this.allAmountScaleErrors.join(' ');
      return;
    }
    this.confirmLoading = true;
    this.confirmError = null;
    const request = buildConfirmRequest(this.selectedCase, this.model, this.debitLegs, this.creditLegs, this.buildSuspenseBridge());
    this.api.confirm(request, false).subscribe({
      next: ({ instruction, created }) => {
        this.result = {
          classification: instruction.classification,
          balance: null,
          accountEntries: instruction.accountEntries,
          swiftMessages: instruction.swiftMessages,
          instructionId: instruction.instructionId,
          confirmed: true,
          replay: !created,
        };
        this.confirmLoading = false;
      },
      error: (err) => {
        // Point 1 fix: a failed Confirm must not leave an old (now-misleading) result on screen.
        this.result = null;
        this.confirmError = this.describeError(err);
        this.confirmLoading = false;
      },
    });
  }

  private runPreview(config: BusinessCaseConfig) {
    this.previewError = null;
    this.previewIncomplete = false;

    // H-2 client-side guard: an over-precise amount can't post — surface it now
    // (with the specific reason) instead of firing a preview that only 400s.
    if (this.hasAmountScaleError) {
      this.result = null;
      this.previewError = this.allAmountScaleErrors.join(' ');
      this.previewLoading = false;
      return of(null);
    }

    if (!this.debitValid || !this.creditValid) {
      // Point 1 fix: incomplete legs (still typing an account no, missing rate, etc.) must clear any stale result, not leave it hanging.
      this.result = null;
      this.previewIncomplete = true;
      this.previewLoading = false;
      return of(null);
    }

    this.previewLoading = true;

    if (config.verdict === 'PASS') {
      const request = buildConfirmRequest(config, this.model, this.debitLegs, this.creditLegs, this.buildSuspenseBridge());
      if (!request.mainRef || !request.unitCode) {
        this.result = null;
        this.previewIncomplete = true;
        this.previewLoading = false;
        return of(null);
      }
      return this.api.confirm(request, true).pipe(
        tap(({ instruction }) => {
          this.result = {
            classification: instruction.classification,
            balance: null,
            accountEntries: instruction.accountEntries,
            swiftMessages: instruction.swiftMessages,
            instructionId: instruction.instructionId,
            confirmed: false,
            replay: false,
          };
          this.previewLoading = false;
        }),
        catchError((err) => {
          // Point 1 fix: a rejected preview (400/409) must erase the stale display, not sit next to it.
          this.result = null;
          this.previewError = this.describeError(err);
          this.previewLoading = false;
          return of(null);
        }),
      );
    }

    // GAP (RPFM) — classify-only preview, never a Confirm action. POST
    // /payment-instructions/classify has no suspenseBridge field in its own
    // request schema (only PaymentInstructionConfirmRequest — the real
    // Confirm body — does, v1.4.0); any Suspense entries the user has
    // entered are simply not part of a GAP-case preview.
    return this.api.classify(this.debitLegs, this.creditLegs).pipe(
      tap((res) => {
        this.result = {
          classification: res.classification,
          balance: res.balance,
          accountEntries: res.accountEntries,
          swiftMessages: null,
          instructionId: null,
          confirmed: false,
          replay: false,
        };
        this.previewLoading = false;
      }),
      catchError((err) => {
        this.result = null;
        this.previewError = this.describeError(err);
        this.previewLoading = false;
        return of(null);
      }),
    );
  }

  private describeError(err: unknown): string {
    if (err instanceof PaymentComponentApiError) {
      return `[${err.status}] ${err.message}`;
    }
    return err instanceof Error ? err.message : String(err);
  }

  ngOnDestroy(): void {
    this.previewSub?.unsubscribe();
  }
}
