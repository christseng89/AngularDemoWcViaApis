import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import type { Observable } from "rxjs";
import type { PaymentMessageIndexResponse } from "./payment-message-index";

/** HTTP transport for Payment Settlement; no resolution or routing decisions. */
@Injectable({ providedIn: "root" })
export class PaymentSettlementApiService {
  private readonly http = inject(HttpClient);
  private readonly api = "http://localhost:3100/api/settlements";

  messageIndex(): Observable<PaymentMessageIndexResponse> {
    return this.http.get<PaymentMessageIndexResponse>(
      `${this.api}/message-index`,
    );
  }

  clearingOptions<T>(
    context: Readonly<Record<string, unknown>>,
  ): Observable<T> {
    return this.http.post<T>(`${this.api}/clearing-options`, context);
  }

  resolve(request: Record<string, unknown>): Observable<unknown> {
    return this.http.post<unknown>(`${this.api}/resolve`, request);
  }

  confirm<T>(
    attemptId: string,
    confirmation: {
      selectedSsiId: string;
      actor: string;
      overrideReason?: string;
    },
  ): Observable<T> {
    return this.http.post<T>(`${this.api}/${attemptId}/confirm`, confirmation);
  }
}
