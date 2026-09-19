import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import type { Observable } from "rxjs";
import type {
  BankPage,
  CurrencyReference,
  OpenApiUiContract,
  PagedRows,
  RmaMessageTypePolicy,
  RmaPairState,
  Row,
} from "./swift-data.models";

/** Transport only; lifecycle policy and governed OAS interpretation stay in the feature. */
@Injectable()
export class SwiftDataApiService {
  private readonly http = inject(HttpClient);
  private readonly api = "http://localhost:3100/api";

  contract(): Observable<OpenApiUiContract> {
    return this.http.get<OpenApiUiContract>("/openapi/swift-data-service.v1.json");
  }

  currencies(): Observable<CurrencyReference[]> {
    return this.http.get<CurrencyReference[]>(`${this.api}/reference/currencies`);
  }

  messageTypePolicy(): Observable<RmaMessageTypePolicy> {
    return this.http.get<RmaMessageTypePolicy>(
      `${this.api}/rma-authorisations/message-type-policy`,
    );
  }

  rows(endpoint: string, query: URLSearchParams): Observable<PagedRows | Row[]> {
    return this.http.get<PagedRows | Row[]>(
      `${this.api}/${endpoint}?${query.toString()}`,
    );
  }

  bankPage(page: number, pageSize: number, query: string): Observable<BankPage> {
    return this.http.get<BankPage>(
      `${this.api}/reference/banks?page=${page}&pageSize=${pageSize}&query=${encodeURIComponent(query)}`,
    );
  }

  pairState(query: URLSearchParams): Observable<RmaPairState> {
    return this.http.get<RmaPairState>(
      `${this.api}/rma-authorisations/pair-state?${query.toString()}`,
    );
  }

  save(endpoint: string, id: string | null, payload: Record<string, unknown>): Observable<Row> {
    const url = id ? `${this.api}/${endpoint}/${id}` : `${this.api}/${endpoint}`;
    return this.http.request<Row>(id ? "PUT" : "POST", url, { body: payload });
  }

  act(endpoint: string, id: string, action: "submit" | "approve", actor: string): Observable<unknown> {
    return this.http.post(`${this.api}/${endpoint}/${id}/${action}`, { actor });
  }

  revise(endpoint: string, id: string, maker: string): Observable<Row> {
    return this.http.post<Row>(`${this.api}/${endpoint}/${id}/revise`, {
      maker,
    });
  }

  suppress(endpoint: string, id: string, maker: string, reason: string): Observable<unknown> {
    return this.http.post(`${this.api}/${endpoint}/${id}/suppress`, {
      maker,
      reason,
    });
  }

  delete(endpoint: string, id: string, body: { actor: string; reason: string }): Observable<unknown> {
    return this.http.delete(`${this.api}/${endpoint}/${id}`, { body });
  }

  reject(endpoint: string, id: string, actor: string, reason: string): Observable<unknown> {
    return this.http.post(`${this.api}/${endpoint}/${id}/reject`, {
      actor,
      reason,
    });
  }

  import(
    dataType: "SSI" | "RMA" | "NOSTRO",
    fileName: string,
    dryRun: boolean,
    idempotencyKey: string,
    records: unknown[],
  ): Observable<unknown> {
    return this.http.post(`${this.api}/swift-data/imports`, {
      dataType,
      fileName,
      dryRun,
      idempotencyKey,
      records,
    });
  }
}
