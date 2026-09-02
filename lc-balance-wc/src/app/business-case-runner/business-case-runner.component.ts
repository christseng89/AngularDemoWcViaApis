import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FormlyFieldConfig, FormlyModule } from '@ngx-formly/core';
import { BalanceCaseApiService, BusinessCaseRunResult, BusinessCaseSummary, TraceStep } from './balance-case-api.service';

/**
 * Business Case Runner — the Balance Component analogue of
 * lc-payment-wc's own payment-component Business Case Simulator. Formly
 * drives the case picker; running a case delegates entirely to the
 * Node.js 中台 (backend/server.js), which sequences the real HTTP calls
 * into the balance-component microservice — this component never talks to
 * the microservice directly.
 */
@Component({
  selector: 'app-business-case-runner',
  imports: [CommonModule, ReactiveFormsModule, FormlyModule],
  templateUrl: './business-case-runner.component.html',
})
export class BusinessCaseRunnerComponent implements OnInit {
  form = new FormGroup({});
  model: { caseId?: string } = {};
  fields: FormlyFieldConfig[] = [];

  cases: BusinessCaseSummary[] = [];
  result: BusinessCaseRunResult | null = null;
  running = false;
  runningAll = false;
  allResults: BusinessCaseRunResult[] = [];
  loadError: string | null = null;
  loadingCases = false;
  recoveringAfterCleanup = false;

  /** "Cleanup Database Tables" button state — independent of run()/runAll()'s own busy/error state. */
  resettingDatabase = false;
  resetDatabaseMessage: string | null = null;

  constructor(private readonly api: BalanceCaseApiService) {}

  ngOnInit(): void {
    this.loadCases();
  }

  private loadCases(afterCleanup = false): void {
    this.loadingCases = true;
    this.loadError = null;
    const request = afterCleanup ? this.api.listCasesWhenReady() : this.api.listCases();
    request.subscribe({
      next: (cases) => {
        this.cases = cases;
        this.fields = [
          {
            key: 'caseId',
            type: 'select',
            props: {
              label: 'Business Case',
              placeholder: 'Choose a case to run…',
              required: true,
              options: cases.map((c) => ({ value: c.id, label: `${c.title} (${c.stepCount} steps)` })),
            },
          },
        ];
        this.loadingCases = false;
        if (afterCleanup) {
          this.resettingDatabase = false;
          this.recoveringAfterCleanup = false;
          this.resetDatabaseMessage = 'Database tables cleaned up. Services are ready.';
        }
      },
      error: (err) => {
        this.loadingCases = false;
        this.resettingDatabase = false;
        this.recoveringAfterCleanup = false;
        this.loadError = `Could not reach the 中台 (backend) at /api/business-cases — is it running? ${err.message ?? err}`;
        if (afterCleanup) this.resetDatabaseMessage = 'Database tables were cleaned, but the services did not become ready before the recovery timeout.';
      },
    });
  }

  retryLoadCases(): void {
    this.loadCases();
  }

  run(): void {
    if (!this.model.caseId) return;
    this.running = true;
    this.result = null;
    this.api.runCase(this.model.caseId).subscribe({
      next: (r) => {
        this.result = r;
        this.running = false;
      },
      error: (err) => {
        this.running = false;
        this.loadError = `Run failed: ${err.message ?? err}`;
      },
    });
  }

  runAll(): void {
    this.runningAll = true;
    this.allResults = [];
    this.result = null;
    const remaining = [...this.cases];
    const next = () => {
      const c = remaining.shift();
      if (!c) {
        this.runningAll = false;
        return;
      }
      this.api.runCase(c.id).subscribe({
        next: (r) => {
          this.allResults = [...this.allResults, r];
          next();
        },
        error: (err) => {
          this.runningAll = false;
          this.loadError = `Run failed on ${c.id}: ${err.message ?? err}`;
        },
      });
    };
    next();
  }

  /** Cleanup also clears stale case traces after the database is empty. */
  resetDatabase(): void {
    if (!confirm('This permanently deletes ALL Balance Contracts and Movements from the database. Continue?')) return;
    this.resettingDatabase = true;
    this.resetDatabaseMessage = null;
    this.api.resetDatabase().subscribe({
      next: () => {
        this.result = null;
        this.allResults = [];
        this.loadError = null;
        this.recoveringAfterCleanup = true;
        this.resetDatabaseMessage = 'Database tables cleaned up. Waiting for services to become ready…';
        this.loadCases(true);
      },
      error: (err) => {
        this.resettingDatabase = false;
        this.recoveringAfterCleanup = false;
        this.resetDatabaseMessage = `Cleanup failed: ${err.message ?? err}`;
      },
    });
  }

  rowClass(step: TraceStep): string {
    if (step.type === 'note') return 'step-note';
    if (step.type === 'createMovement' && step.expectedError) return step.ok ? 'step-error' : 'step-ok';
    if (step.response?.warnings?.length) return 'step-warn';
    if (step.ok === false) return 'step-error';
    if (step.ok === true) return 'step-ok';
    return '';
  }

  statusText(step: TraceStep): string {
    if (step.type === 'note') return '—';
    if (step.skipped) return 'SKIPPED';
    if (step.response?.warnings?.length) return `${step.status} WARN`;
    return `${step.status ?? ''} ${step.ok ? 'OK' : 'ERROR'}`.trim();
  }

  detailText(step: TraceStep): string {
    if (step.type === 'note') return '';
    if (step.skipped) return step.reason ?? '';
    const r = step.response;
    if (!r) return '';
    if (r.code) return `${r.code}: ${r.message}`;
    if (step.type === 'snapshot')
      return (
        `confirmed=${r.confirmedBalance}  available=${r.availableBalance}` +
        (r.offBalanceExposure ? `  offBalanceExposure=${r.offBalanceExposure}  tightAvailable=${r.tightAvailableBalance}` : '')
      );
    if ((step.type === 'createCompoundMovements' || step.type === 'compoundActions') && Array.isArray(r)) {
      return r.map((movement) => `${movement.movementType ?? 'movement'} status=${movement.status}`).join(' | ');
    }
    if (step.type === 'createMovement') {
      const w = r.warnings?.length ? `  ⚠ ${r.warnings[0].message}` : '';
      return `${r.movementType} amount=${r.amount} ceilingAmount=${r.ceilingAmount} status=${r.status}${w}`;
    }
    return `status=${r.status}`;
  }
}
