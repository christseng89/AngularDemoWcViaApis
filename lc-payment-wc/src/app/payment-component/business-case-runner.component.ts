import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FormlyModule, FormlyFieldConfig, FormlyFormOptions } from '@ngx-formly/core';
import { Subject, Subscription, merge, of } from 'rxjs';
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
  imports: [CommonModule, ReactiveFormsModule, FormlyModule, ResponseViewerComponent, LegAllocatorComponent, SuspenseEntriesComponent],
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
   * USD=2, etc.), used by suspenseEntryTrxEquivalent() below so a
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

  constructor(private readonly api: PaymentComponentApiService, currency: CurrencyService, private readonly fx: FxRateService) {
    currency.decimals().subscribe((decimals) => {
      this.currencyDecimals = decimals;
    });
    fx.rates().subscribe((rates) => {
      this.fxRates = rates;
    });
  }

  private decimalsFor(currency: string): number {
    return this.currencyDecimals[currency] ?? 2;
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
   * `request.debitLegs[0]!.currency` — see payment-instructions-post.yaml's
   * SuspenseEntry doc comment). This matters because <app-leg-allocator> lets
   * the user change a debit leg's own currency (its "Transaction Currency"
   * dropdown / a row's own currency select) independently of this component —
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
   */
  get transactionCurrency(): string {
    return this.debitLegs[0]?.currency ?? this.selectedCase?.legs.find((l) => l.side === 'DEBIT')?.defaultCurrency ?? 'USD';
  }
  get baseTotalAmount(): number {
    const debitLegs = this.selectedCase?.legs.filter((l) => l.side === 'DEBIT') ?? [];
    return debitLegs.reduce((sum, l) => sum + (Number(l.defaultAmountTxCcy) || 0), 0);
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
   * NOT FSD-sourced — converts one Suspense entry's amount into "Trx
   * Equivalent": amount × resolveCrossRate(entry, trxCurrency). For a
   * same-currency entry this is the exact original amount, unrounded (no
   * conversion occurred) — matching domain/suspenseBridge.ts's own
   * pass-through for the same case. For a cross-currency entry the product
   * is rounded to decimalsFor(trxCurrency) places (ROUND_HALF_UP, via
   * decimal.js — matching money.ts's own convention) IMMEDIATELY, per entry
   * — not deferred to a single rounding of the summed total — because the
   * server independently rounds each entry's own bridge leg the same way
   * before summing; rounding this component's total only once at the end
   * (sum-then-round) can disagree with the server's per-entry round-then-sum
   * for a multi-entry list, even when both use the same target precision.
   * Returns 0 for a blank/zero/incomplete entry (no amount or no currency
   * yet).
   */
  private suspenseEntryTrxEquivalent(entry: SuspenseEntry, trxCurrency: string): number {
    const amount = Number(entry.amount) || 0;
    if (amount === 0 || !entry.currency) return 0;
    if (entry.currency === trxCurrency) return amount;
    const rate = this.resolveCrossRate(entry, trxCurrency);
    const scale = this.decimalsFor(trxCurrency);
    return new Decimal(amount).times(rate).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP).toNumber();
  }

  /** Sum of suspenseEntryTrxEquivalent() across every entry in a Suspense Debit/Credit list — each entry may be in a different currency, all converted into the same trxCurrency before summing. */
  private suspenseEntriesTrxEquivalent(entries: readonly SuspenseEntry[], trxCurrency: string): number {
    return entries.reduce((sum, entry) => sum + this.suspenseEntryTrxEquivalent(entry, trxCurrency), 0);
  }

  /**
   * Debit Leg #1 / Credit Leg #1 seed amount — feeds <app-leg-allocator
   * [initialTotalAmount]>, which only ever seeds/reset()s a single 100% row
   * (Leg #1); any further %-split the user does inside the allocator is
   * unaffected by this (per the user's own framing: "Debit Leg #1 / Credit
   * Leg #1 才做 % 控制"). The case's own Total Amount (baseTotalAmount
   * above) is NEVER itself modified — only this derived, adjusted value is:
   *
   *   Debit Leg #1  = Total Amount + Σ Suspense Debit entries  (Trx Equivalent)
   *   Credit Leg #1 = Total Amount - Σ Suspense Credit entries (Trx Equivalent)
   *
   * See suspenseBridgeLegs() below for the matching entries that keep this
   * balanced.
   *
   * The "Trx Equivalent" conversion target MUST be `this.transactionCurrency`
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
   */
  private sideDefaults(side: 'DEBIT' | 'CREDIT') {
    const legs = this.selectedCase?.legs.filter((l) => l.side === side) ?? [];
    const baseTotalAmount = legs.reduce((sum, l) => sum + (Number(l.defaultAmountTxCcy) || 0), 0);
    const currency = legs[0]?.defaultCurrency ?? 'USD';
    const trxCurrency = this.transactionCurrency;

    const adjustment =
      side === 'DEBIT'
        ? this.suspenseEntriesTrxEquivalent(this.suspenseDebitEntries, trxCurrency)
        : -this.suspenseEntriesTrxEquivalent(this.suspenseCreditEntries, trxCurrency);
    const totalAmount = baseTotalAmount + adjustment;

    return {
      totalAmount: totalAmount ? String(totalAmount) : '0',
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
        // Same resolveCrossRate() as suspenseEntryTrxEquivalent() above — this component's own
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
  onSuspenseDebitEntriesChange(entries: SuspenseEntry[]): void {
    this.suspenseDebitEntries = entries;
    this.legsChanged$.next();
  }
  onSuspenseCreditEntriesChange(entries: SuspenseEntry[]): void {
    this.suspenseCreditEntries = entries;
    this.legsChanged$.next();
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
    this.debitValid = false;
    this.creditValid = false;
    this.suspenseDebitEntries = [];
    this.suspenseCreditEntries = [];
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
