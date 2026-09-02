import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable, retry, throwError, timer } from 'rxjs';
import { SKIP_SAFE_READ_RETRY, isTransientHttpError } from '../core/http-retry/http-retry.interceptor';
import { GENERATED_BUSINESS_CASE_RECOVERY_INTERVAL_MS, GENERATED_BUSINESS_CASE_RECOVERY_RETRY_COUNT } from '../core/http-retry/http-retry.config.generated';

export interface BusinessCaseSummary {
  id: string;
  title: string;
  description: string;
  stepCount: number;
}

export interface TraceStep {
  type: 'createMovement' | 'createCompoundMovements' | 'compoundActions' | 'release' | 'makerSubmit' | 'acknowledge' | 'snapshot' | 'note';
  functionCode?: 'A4' | 'A6' | 'B4';
  label: string;
  status?: number;
  ok?: boolean;
  expectedError?: boolean;
  skipped?: boolean;
  reason?: string;
  request?: unknown;
  response?: any;
}

export interface BusinessCaseRunResult {
  id: string;
  title: string;
  description: string;
  trace: TraceStep[];
}

export interface BusinessCaseRecoveryPolicy {
  readonly maxRetries: number;
  readonly intervalMs: number;
}

const DEFAULT_RECOVERY_POLICY: BusinessCaseRecoveryPolicy = {
  maxRetries: GENERATED_BUSINESS_CASE_RECOVERY_RETRY_COUNT,
  intervalMs: GENERATED_BUSINESS_CASE_RECOVERY_INTERVAL_MS,
};

/** Talks to the Node.js 中台 (backend/server.js), never directly to the balance-component microservice — the UI only ever sees orchestrated business-case results. */
@Injectable({ providedIn: 'root' })
export class BalanceCaseApiService {
  constructor(private readonly http: HttpClient) {}

  listCases(): Observable<BusinessCaseSummary[]> {
    const context = new HttpContext().set(SKIP_SAFE_READ_RETRY, true);
    return this.http.get<BusinessCaseSummary[]>('/api/business-cases', { context });
  }

  /**
   * Business Case Runner readiness probe. It owns a slower, bounded recovery policy and bypasses the
   * generic interceptor so one logical probe never expands into nested bursts of GET retries.
   */
  listCasesWhenReady(policy: BusinessCaseRecoveryPolicy = DEFAULT_RECOVERY_POLICY): Observable<BusinessCaseSummary[]> {
    const context = new HttpContext().set(SKIP_SAFE_READ_RETRY, true);
    return this.http.get<BusinessCaseSummary[]>('/api/business-cases', { context }).pipe(
      retry({
        count: policy.maxRetries,
        delay: (error) => (isTransientHttpError(error) ? timer(policy.intervalMs) : throwError(() => error)),
      }),
    );
  }

  runCase(id: string): Observable<BusinessCaseRunResult> {
    return this.http.post<BusinessCaseRunResult>(`/api/business-cases/${id}/run`, {});
  }

  /** Dev-only — Business Case Runner's "Cleanup Database Tables" button. Wipes every balance_movements/balance_contracts row. */
  resetDatabase(): Observable<{ status: string }> {
    return this.http.post<{ status: string }>('/api/admin/reset-database', {});
  }
}
