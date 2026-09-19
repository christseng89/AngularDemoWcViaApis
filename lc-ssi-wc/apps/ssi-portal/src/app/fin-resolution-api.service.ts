import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import type { Observable } from "rxjs";

/** HTTP transport for FIN resolution; scenario and selection policy stay with the feature. */
@Injectable({ providedIn: "root" })
export class FinResolutionApiService {
  private readonly http = inject(HttpClient);
  private readonly api = "http://localhost:3100/api";

  extract<T>(request: { format: string; content: string }): Observable<T> {
    return this.http.post<T>(`${this.api}/messages/extract`, request);
  }

  controlledResolution<T>(request: Record<string, unknown>): Observable<T> {
    return this.http.post<T>(
      `${this.api}/reference/fin-controlled-resolutions`,
      request,
    );
  }

  controlledFixtures<T>(parameters: URLSearchParams): Observable<T> {
    return this.http.get<T>(
      `${this.api}/reference/fin-controlled-fixtures?${parameters.toString()}`,
    );
  }

  catalogue<T>(standardsRelease: string): Observable<T> {
    return this.http.get<T>(
      `${this.api}/reference/fin-resolution-catalogue?standardsRelease=${encodeURIComponent(standardsRelease)}`,
    );
  }
}
