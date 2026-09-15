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
  readonly currentSnapshot: { readonly sha256: string; readonly method: string };
}

export interface DemoReloadResult {
  readonly code: "DEMO_DATA_RELOADED";
  readonly completedAt: string;
  readonly snapshotHash: string;
  readonly snapshotIdentityMethod: string;
  readonly seedSha256?: string;
  readonly importedRows: Readonly<Record<string, number>>;
}

@Injectable({ providedIn: "root" })
export class RuntimeSettingsService {
  private readonly http = inject(HttpClient);
  private readonly api = "http://localhost:3100/api/settings";

  runtime(): Observable<RuntimeSettings> {
    return this.http.get<RuntimeSettings>(`${this.api}/runtime`);
  }

  reloadDevelopmentData(password: string): Observable<DemoReloadResult> {
    return this.http.post<DemoReloadResult>(`${this.api}/development-data/reload`, { password });
  }
}
