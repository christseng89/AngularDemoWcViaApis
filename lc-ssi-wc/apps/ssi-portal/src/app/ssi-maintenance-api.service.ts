import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import type { Observable } from "rxjs";
import type { SsiIndexSummary, SsiPage, SsiRow } from "./ssi-maintenance.types";
import type { CounterpartySsiSummarySource } from "./ssi-maintenance-index";

@Injectable({ providedIn: "root" })
export class SsiMaintenanceApiService {
  private readonly http = inject(HttpClient);
  private readonly api = "http://localhost:3100/api/ssis";

  list(query: URLSearchParams): Observable<SsiPage | SsiRow[]> {
    return this.http.get<SsiPage | SsiRow[]>(`${this.api}?${query.toString()}`);
  }

  summary(): Observable<SsiIndexSummary> {
    return this.http.get<SsiIndexSummary>(`${this.api}/summary`);
  }

  counterpartyCoverage(): Observable<readonly CounterpartySsiSummarySource[]> {
    return this.http.get<readonly CounterpartySsiSummarySource[]>(
      `${this.api}/counterparty-coverage?status=ACTIVE`,
    );
  }

  createDraft(model: Record<string, unknown>): Observable<unknown> {
    return this.http.post(this.api, model);
  }

  updateDraft(id: string, model: Record<string, unknown>): Observable<unknown> {
    return this.http.put(`${this.api}/${id}`, model);
  }

  act(
    id: string,
    action: "submit" | "approve",
    actor: string,
  ): Observable<unknown> {
    return this.http.post(`${this.api}/${id}/${action}`, { actor });
  }

  reserveRevision(id: string, maker: string): Observable<SsiRow> {
    return this.http.post<SsiRow>(`${this.api}/${id}/revise`, { maker });
  }

  cancelRevision(id: string, actor: string): Observable<unknown> {
    return this.http.post(`${this.api}/${id}/cancel-revision`, { actor });
  }

  revokeDraft(id: string, actor: string, reason: string): Observable<unknown> {
    return this.http.delete(`${this.api}/${id}`, { body: { actor, reason } });
  }

  suppress(id: string, maker: string, reason: string): Observable<unknown> {
    return this.http.post(`${this.api}/${id}/suppress`, { maker, reason });
  }
}
