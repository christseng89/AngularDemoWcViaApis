import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FormlyModule, FormlyFieldConfig, FormlyFormOptions } from '@ngx-formly/core';
import { Subject, Subscription, merge, of } from 'rxjs';
import { debounceTime, switchMap, catchError, tap, map } from 'rxjs/operators';

import { ResponseViewerComponent } from './response-viewer.component';
import { LegAllocatorComponent } from './leg-allocator.component';
import { SuspenseEntriesComponent, type SuspenseEntry } from './suspense-entries.component';
import { MODULE_GROUPS } from './business-case-registry';
import { buildHeaderFields, buildTailFields } from './business-case-fields';
import { buildConfirmRequest } from './business-case-request';
import { PaymentComponentApiService, PaymentComponentApiError } from './payment-component-api.service';
import { CurrencyService, type CurrencyOption } from './currency.service';
import { FxRateService } from './fx-rate.service';
import type { BusinessCaseConfig, ModuleGroup } from './business-case.model';
import type { AccountEntry, AccountType, ClassificationResult, PaymentLegInput, SwiftMessage } from './payment-component.types';

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
  tailFields: FormlyFieldConfig[] = [];
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
   * "Get Currency API" options, threaded into every Formly 'currency' select
   * field (business-case-fields.ts) as a plain array — NOT an Observable.
   * Formly's `props.options` accepts an Observable in principle, but doing so
   * here broke expression re-evaluation for the whole enclosing fieldGroup
   * (`hide` on the Liability/Charge panels silently stopped reacting to their
   * own checkbox — confirmed live: field.model updated correctly, but
   * field.hide stayed stuck true). Resolving once here and rebuilding
   * tailFields when it arrives avoids Formly ever seeing an Observable prop.
   */
  private currencyOptions: CurrencyOption[] = [];

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

  constructor(private readonly api: PaymentComponentApiService, currency: CurrencyService, private readonly fx: FxRateService) {
    currency.options().subscribe((opts) => {
      this.currencyOptions = opts;
      if (this.selectedCase) {
        this.tailFields = buildTailFields(this.selectedCase, this.currencyOptions);
      }
    });
    fx.rates().subscribe((rates) => {
      this.fxRates = rates;
    });
  }

  get casesForSelectedModule(): BusinessCaseConfig[] {
    return this.moduleGroups.find((g) => g.module === this.selectedModule)?.cases ?? [];
  }

  /**
   * Shown once, right under the Unit Code row (business-case-runner.component.html) —
   * NOT repeated inside either <app-leg-allocator> (see that component's
   * showTotalAmount input). Derived from the selected case's DEBIT-side leg
   * defaults; by construction every case in the registry already has
   * sum(debit defaults) === sum(credit defaults) (V8 requires it), so either
   * side would give the same figure — DEBIT is picked arbitrarily as the
   * canonical source.
   */
  get transactionCurrency(): string {
    return this.selectedCase?.legs.find((l) => l.side === 'DEBIT')?.defaultCurrency ?? 'USD';
  }
  get baseTotalAmount(): number {
    const debitLegs = this.selectedCase?.legs.filter((l) => l.side === 'DEBIT') ?? [];
    return debitLegs.reduce((sum, l) => sum + (Number(l.defaultAmountTxCcy) || 0), 0);
  }

  /**
   * NOT FSD-sourced — converts one Suspense entry's amount into "Trx
   * Equivalent": amount × crossRate(entry.currency -> trxCurrency), using
   * the same FxRateService/table <app-leg-allocator> itself uses for its own
   * rows. Falls back to a 1:1 rate when the pair isn't in the demo's rate
   * table (or hasn't loaded yet) rather than blocking — same "leave it
   * editable, don't silently guess a real rate" spirit as
   * leg-allocator.component.ts's applyFxRate(), just without a manual
   * override field of its own here. Returns 0 for a blank/zero/incomplete
   * entry (no amount or no currency yet).
   */
  private suspenseEntryTrxEquivalent(entry: SuspenseEntry, trxCurrency: string): number {
    const amount = Number(entry.amount) || 0;
    if (amount === 0 || !entry.currency) return 0;
    const rate = this.fx.crossRate(this.fxRates, entry.currency, trxCurrency) ?? 1;
    return amount * rate;
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
   */
  private sideDefaults(side: 'DEBIT' | 'CREDIT') {
    const legs = this.selectedCase?.legs.filter((l) => l.side === side) ?? [];
    const baseTotalAmount = legs.reduce((sum, l) => sum + (Number(l.defaultAmountTxCcy) || 0), 0);
    const currency = legs[0]?.defaultCurrency ?? 'USD';

    const adjustment =
      side === 'DEBIT'
        ? this.suspenseEntriesTrxEquivalent(this.suspenseDebitEntries, currency)
        : -this.suspenseEntriesTrxEquivalent(this.suspenseCreditEntries, currency);
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
   * NOT FSD-sourced — the Charge Component / Payment Component accounting
   * bridge: an external "Charge Component" books
   * Dr Suspense - Debit / Dr Suspense - Credit against Cr Commission
   * accounts; this Payment Component posts the offsetting
   * Cr Suspense - Debit / Cr Suspense - Credit so the two components'
   * Suspense entries net to zero once combined. Both land on the CREDIT
   * side here — NOT one Dr / one Cr — which is what keeps this instruction
   * itself balanced without any extra logic:
   *
   *   Σ Debit  = (Total + SD)                                    = Total + SD
   *   Σ Credit = (Total - SC) + SD [[bridge for SD]] + SC [[bridge for SC]] = Total + SD
   *
   * The SC term always cancels itself out (its own Leg #1 subtraction and
   * its own bridge entry are both on the credit side); the SD term is the
   * only one that changes the instruction's net size, deliberately — it's
   * the "collect more" case (買方/buyer), while SC's self-cancelling
   * pattern is the "pay less" case (賣方/seller): money redirected into
   * Suspense instead of paid out, not a change in total size. Each side may
   * hold multiple entries (suspenseDebitEntries/suspenseCreditEntries) —
   * every non-zero entry becomes its OWN Cr Suspense - Debit/Credit leg
   * (same account per side, one line per entry — see suspenseBridgeLegs()),
   * not merged into a single combined leg, so a mixed-currency set of
   * Charge-Component commission lines stays itemized. Returns null for a
   * blank/zero/incomplete entry (no amount or no currency yet).
   *
   * This alone only balances in TRANSACTION-CURRENCY-equivalent terms (what
   * V8 / domain/balanceValidation.ts checks — Σ amountTxCcy). When the
   * Suspense entry's own currency differs from the transaction currency,
   * fxExchangePairLegs() below adds the matching FX Exchange pair so the
   * settlement voucher also balances BY EACH CURRENCY, not just in
   * aggregate — see that method's doc comment.
   */
  private suspenseBridgeLeg(accountNo: 'Suspense - Debit' | 'Suspense - Credit', entry: SuspenseEntry): PaymentLegInput | null {
    const trxCurrency = this.transactionCurrency;
    const trxEquivalent = this.suspenseEntryTrxEquivalent(entry, trxCurrency);
    if (trxEquivalent === 0) return null;

    // suspenseEntryTrxEquivalent() already returned 0 (and we'd have bailed above) for a
    // blank entry.currency or an entry.amount that parses to 0/NaN — so both are guaranteed
    // well-formed from here on; no `|| fallback` needed for either.
    const ownCurrency = entry.currency;
    const leg: PaymentLegInput = {
      accountNo,
      accountType: 'SUSPENSE',
      currency: ownCurrency,
      amountTxCcy: trxEquivalent.toFixed(2),
    };
    if (ownCurrency !== trxCurrency) {
      leg.amountAccountCcy = Number(entry.amount).toFixed(2);
      const rate = this.fx.crossRate(this.fxRates, ownCurrency, trxCurrency);
      if (rate !== null) leg.crBuyRate = rate.toFixed(6);
    }
    return leg;
  }

  /**
   * Mirrors leg-allocator.component.ts's own fxPairs concept (Trx-Ccy-site +
   * Other-Ccy-site) for a bridge leg whose own currency differs from the
   * transaction currency — except these are actually SENT to the
   * microservice (leg-allocator's fxPairs stays display-only, for its
   * regular rows — a pre-existing, repo-wide gap this does NOT fix for
   * those rows, only for the Suspense bridge legs here).
   *
   * Same-direction "Trx Ccy site" entry (account `FX Exchange {bridge's own
   * currency}`, in the transaction currency, amount = the Trx Equivalent)
   * lands on the SAME (credit) side as the bridge leg — both bridge legs are
   * always credit, see suspenseBridgeLeg()'s doc comment. Opposite-direction
   * "Other Ccy site" entry (account `FX Exchange {transaction currency}`, in
   * the bridge's own currency, amount = the raw Suspense amount) lands on
   * the debit side. Together with the bridge leg itself, all three net to
   * zero in the bridge's own currency (the bridge leg's own amount is
   * exactly cancelled by the Other-Ccy-site entry), while the pair's two
   * entries net to zero in transaction-currency terms too (same amount,
   * opposite sides) — so this can never disturb the transaction-currency
   * balance suspenseBridgeLeg() already establishes; it only adds
   * genuine per-currency balance on top of it. accountType 'INTERNAL'
   * (classification.ts already excludes INTERNAL from every XOR term, same
   * as SUSPENSE, so this can't accidentally flip paymentComponentRelated).
   * Returns { debit: [], credit: [] } when the bridge leg's currency
   * already equals the transaction currency — nothing to convert.
   */
  private fxExchangePairLegs(bridgeLeg: PaymentLegInput): { debit: PaymentLegInput[]; credit: PaymentLegInput[] } {
    const trxCurrency = this.transactionCurrency;
    if (bridgeLeg.currency === trxCurrency) return { debit: [], credit: [] };

    const trxEquivalent = bridgeLeg.amountTxCcy;
    const rawAmount = bridgeLeg.amountAccountCcy ?? bridgeLeg.amountTxCcy;
    const rate = this.fx.crossRate(this.fxRates, bridgeLeg.currency, trxCurrency);

    const trxCcySiteLeg: PaymentLegInput = {
      accountNo: `FX Exchange ${bridgeLeg.currency}`,
      accountType: 'INTERNAL',
      currency: trxCurrency,
      amountTxCcy: trxEquivalent,
    };
    const otherCcySiteLeg: PaymentLegInput = {
      accountNo: `FX Exchange ${trxCurrency}`,
      accountType: 'INTERNAL',
      currency: bridgeLeg.currency,
      amountTxCcy: trxEquivalent,
      amountAccountCcy: rawAmount,
    };
    if (rate !== null) {
      trxCcySiteLeg.crBuyRate = rate.toFixed(6); // same side as the bridge leg (credit)
      otherCcySiteLeg.drBuyRate = rate.toFixed(6); // opposite side (debit)
    }

    return { debit: [otherCcySiteLeg], credit: [trxCcySiteLeg] };
  }

  /**
   * Every Suspense entry (both sides' lists), turned into its own bridge
   * leg (all land on CREDIT — see suspenseBridgeLeg() doc comment) plus its
   * FX Exchange pair when its own currency differs from the transaction
   * currency. This — not this.debitLegs/this.creditLegs directly — is what
   * actually gets appended at request-build time; see buildLegsForRequest().
   */
  private suspenseBridgeLegs(): { debit: PaymentLegInput[]; credit: PaymentLegInput[] } {
    const debit: PaymentLegInput[] = [];
    const credit: PaymentLegInput[] = [];

    const lists: readonly ['Suspense - Debit' | 'Suspense - Credit', readonly SuspenseEntry[]][] = [
      ['Suspense - Debit', this.suspenseDebitEntries],
      ['Suspense - Credit', this.suspenseCreditEntries],
    ];
    for (const [accountNo, entries] of lists) {
      for (const entry of entries) {
        const bridgeLeg = this.suspenseBridgeLeg(accountNo, entry);
        if (!bridgeLeg) continue;
        credit.push(bridgeLeg); // every bridge leg lands on CREDIT — see suspenseBridgeLeg() doc comment
        const pair = this.fxExchangePairLegs(bridgeLeg);
        debit.push(...pair.debit);
        credit.push(...pair.credit);
      }
    }

    return { debit, credit };
  }

  /**
   * debitLegs/creditLegs as emitted by <app-leg-allocator>, plus the
   * Suspense bridge (+ FX Exchange pair) legs above — this is what actually
   * goes out in a request. this.debitLegs/this.creditLegs themselves stay
   * exactly what the allocator emitted (debitValid/creditValid gating is
   * purely about the allocator's own rows, unaffected by the bridge).
   */
  private buildLegsForRequest(): { debitLegs: PaymentLegInput[]; creditLegs: PaymentLegInput[] } {
    const bridge = this.suspenseBridgeLegs();
    return {
      debitLegs: [...this.debitLegs, ...bridge.debit],
      creditLegs: [...this.creditLegs, ...bridge.credit],
    };
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
    this.tailFields = businessCase ? buildTailFields(businessCase, this.currencyOptions) : [];

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
    const { debitLegs, creditLegs } = this.buildLegsForRequest();
    const request = buildConfirmRequest(this.selectedCase, this.model, debitLegs, creditLegs);
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
      const { debitLegs, creditLegs } = this.buildLegsForRequest();
      const request = buildConfirmRequest(config, this.model, debitLegs, creditLegs);
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

    // GAP (RPFM) — classify-only preview, never a Confirm action. No header/suspense
    // fields render for GAP cases (buildSuspenseFields returns [] for non-PASS), so
    // buildLegsForRequest() is a no-op augmentation here — kept for consistency.
    const gapLegs = this.buildLegsForRequest();
    return this.api.classify(gapLegs.debitLegs, gapLegs.creditLegs).pipe(
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
