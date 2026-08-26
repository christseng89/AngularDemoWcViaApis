import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface BusinessCaseSummary {
  id: string;
  title: string;
  description: string;
  stepCount: number;
}

export interface TraceStep {
  type: 'createMovement' | 'release' | 'snapshot' | 'note';
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

/** Talks to the Node.js 中台 (backend/server.js), never directly to the balance-component microservice — the UI only ever sees orchestrated business-case results. */
@Injectable({ providedIn: 'root' })
export class BalanceCaseApiService {
  constructor(private readonly http: HttpClient) {}

  listCases(): Observable<BusinessCaseSummary[]> {
    return this.http.get<BusinessCaseSummary[]>('/api/business-cases');
  }

  runCase(id: string): Observable<BusinessCaseRunResult> {
    return this.http.post<BusinessCaseRunResult>(`/api/business-cases/${id}/run`, {});
  }

  /** Dev-only — Business Case Runner's "Cleanup Database Tables" button. Wipes every balance_movements/balance_contracts row. */
  resetDatabase(): Observable<{ status: string }> {
    return this.http.post<{ status: string }>('/api/admin/reset-database', {});
  }
}
