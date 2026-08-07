import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FormlyModule, FormlyFieldConfig, FormlyFormOptions } from '@ngx-formly/core';
import { Subject, Subscription, merge, of } from 'rxjs';
import { debounceTime, switchMap, catchError, tap, map } from 'rxjs/operators';

import { ResponseViewerComponent } from './response-viewer.component';
import { LegAllocatorComponent } from './leg-allocator.component';
import { MODULE_GROUPS } from './business-case-registry';
import { buildHeaderFields, buildTailFields } from './business-case-fields';
import { buildConfirmRequest } from './business-case-request';
import { PaymentComponentApiService, PaymentComponentApiError } from './payment-component-api.service';
import { CurrencyService, type CurrencyOption } from './currency.service';
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
  imports: [CommonModule, ReactiveFormsModule, FormlyModule, ResponseViewerComponent, LegAllocatorComponent],
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

  constructor(private readonly api: PaymentComponentApiService, currency: CurrencyService) {
    currency.options().subscribe((opts) => {
      this.currencyOptions = opts;
      if (this.selectedCase) {
        this.tailFields = buildTailFields(this.selectedCase, this.currencyOptions);
      }
    });
  }

  get casesForSelectedModule(): BusinessCaseConfig[] {
    return this.moduleGroups.find((g) => g.module === this.selectedModule)?.cases ?? [];
  }

  private sideDefaults(side: 'DEBIT' | 'CREDIT') {
    const legs = this.selectedCase?.legs.filter((l) => l.side === side) ?? [];
    const totalAmount = legs.reduce((sum, l) => sum + (Number(l.defaultAmountTxCcy) || 0), 0);
    return {
      totalAmount: totalAmount ? String(totalAmount) : '0',
      currency: legs[0]?.defaultCurrency ?? 'USD',
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
    const request = buildConfirmRequest(this.selectedCase, this.model, this.debitLegs, this.creditLegs);
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
      const request = buildConfirmRequest(config, this.model, this.debitLegs, this.creditLegs);
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

    // GAP (RPFM) — classify-only preview, never a Confirm action.
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
