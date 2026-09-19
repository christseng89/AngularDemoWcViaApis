import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import type { Observable } from "rxjs";
import type {
  SsiIndexSummary,
  SsiPage,
  SsiRow,
} from "../ssi-maintenance.types";

export interface CheckerResourceContract {
  id: string;
  label: string;
  endpoint: string;
  "x-lifecycle": readonly string[];
}

export interface CheckerOpenApiContract {
  "x-ui-resources": readonly CheckerResourceContract[];
}

export interface GovernedPendingRow {
  resourceId: string;
  resourceLabel: string;
  endpoint: string;
  id: string;
  status: string;
  maker: string;
  version: number;
}

@Injectable()
export class CheckerApiService {
  private readonly http = inject(HttpClient);
  private readonly api = "http://localhost:3100/api";

  pendingSsi(): Observable<SsiPage | SsiRow[]> {
    return this.http.get<SsiPage | SsiRow[]>(
      `${this.api}/ssis?status=PENDING_APPROVAL&page=1&pageSize=100&sortBy=STATUS&sortDirection=ASC`,
    );
  }

  summary(): Observable<SsiIndexSummary> {
    return this.http.get<SsiIndexSummary>(`${this.api}/ssis/summary`);
  }

  governedContract(): Observable<CheckerOpenApiContract> {
    return this.http.get<CheckerOpenApiContract>(
      "/openapi/swift-data-service.v1.json",
    );
  }

  governedPending(
    endpoint: string,
  ): Observable<
    readonly Omit<
      GovernedPendingRow,
      "resourceId" | "resourceLabel" | "endpoint"
    >[]
  > {
    return this.http.get<
      Array<{
        id: string;
        status: string;
        maker: string;
        version: number;
      }>
    >(`${this.api}/${endpoint}?status=PENDING_APPROVAL`);
  }

  decideSsi(
    id: string,
    decision: "approve" | "reject",
    reason?: string,
  ): Observable<unknown> {
    return this.http.post(`${this.api}/ssis/${id}/${decision}`, {
      actor: "checker.demo",
      ...(decision === "reject" ? { reason } : {}),
    });
  }
}
