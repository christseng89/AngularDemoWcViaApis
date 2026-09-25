import { inject, Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import type { Observable } from "rxjs";

export interface RuntimeSettings {
  readonly runtimeEnvironment: string;
  readonly developmentEnabled: boolean;
  readonly reloadAvailable: boolean;
  readonly fixtureId?: string;
  readonly seedSha256?: string;
  readonly statusPolicyVersion: string;
  readonly resolutionCurrencyInquiry?: {
    readonly title: string;
    readonly sortBy: string;
    readonly sortDirection: "asc" | "desc";
    readonly pageSize: number;
  };
}

export interface DemoReloadResult {
  readonly code: "DEMO_DATA_RELOADED";
  readonly completedAt: string;
  readonly snapshotHash: string;
  readonly snapshotIdentityMethod: string;
  readonly seedSha256?: string;
  readonly importedRows: Readonly<Record<string, number>>;
}

export interface DemoReloadAuthorization {
  readonly code: "DEMO_RELOAD_AUTHORIZED";
  readonly authorizationToken: string;
  readonly expiresAt: string;
  readonly dataset: {
    readonly displayName: string;
    readonly version: string;
    readonly classification: string;
    readonly estimatedRows: number;
  };
}

export interface CurrencyInquiryContract {
  readonly "x-ui-inquiries": readonly {
    readonly id: string;
    readonly endpoint: string;
    readonly mode: string;
    readonly search?: { readonly label: string; readonly placeholder: string };
    readonly columns: readonly {
      readonly path: string;
      readonly label: string;
      readonly presentation?: "strong" | "status";
    }[];
  }[];
}

export interface ResolutionCurrencyRow {
  readonly standardsRelease: string;
  readonly businessDomain: string;
  readonly currency: string;
  readonly status: string;
  readonly source: string;
  readonly updatedAt: string;
  readonly lastResyncAt: string | null;
}

export interface ResolutionCurrencyPage {
  readonly items: readonly ResolutionCurrencyRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
}

export interface ResolutionCurrencyResyncResult {
  readonly discovered: number;
  readonly inserted: number;
  readonly unchanged: number;
  readonly activated: number;
  readonly inactivated: number;
}

@Injectable({ providedIn: "root" })
export class RuntimeSettingsService {
  private readonly http = inject(HttpClient);
  private readonly api = "/api/settings";

  runtime(): Observable<RuntimeSettings> {
    return this.http.get<RuntimeSettings>(`${this.api}/runtime`);
  }

  authorizeDevelopmentDataReload(
    password: string,
  ): Observable<DemoReloadAuthorization> {
    return this.http.post<DemoReloadAuthorization>(
      `${this.api}/development-data/reload/authorize`,
      { password },
    );
  }

  reloadDevelopmentData(
    authorizationToken: string,
  ): Observable<DemoReloadResult> {
    return this.http.post<DemoReloadResult>(
      `${this.api}/development-data/reload`,
      { authorizationToken },
    );
  }

  cancelDevelopmentDataReload(
    authorizationToken: string,
  ): Observable<{ code: string }> {
    return this.http.post<{ code: string }>(
      `${this.api}/development-data/reload/cancel`,
      { authorizationToken },
    );
  }

  currencyContract(): Observable<CurrencyInquiryContract> {
    return this.http.get<CurrencyInquiryContract>(
      "/openapi/swift-data-service.v1.json",
    );
  }

  resolutionCurrencies(
    page: number,
    pageSize: number,
    search: string,
    sortBy: string,
    sortDirection: "asc" | "desc",
  ): Observable<ResolutionCurrencyPage> {
    return this.http.get<ResolutionCurrencyPage>(
      `${this.api}/resolution-currencies`,
      {
        params: { page, pageSize, search, sortBy, sortDirection },
      },
    );
  }

  resyncResolutionCurrencies(): Observable<ResolutionCurrencyResyncResult> {
    return this.http.post<ResolutionCurrencyResyncResult>(
      `${this.api}/resolution-currencies/resync`,
      {},
    );
  }
}
