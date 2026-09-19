import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import type { Observable } from "rxjs";

/** HTTP-only access to standing-data lookups; callers retain filtering and selection. */
@Injectable({ providedIn: "root" })
export class ReferenceLookupApiService {
  private readonly http = inject(HttpClient);
  private readonly api = "http://localhost:3100/api";

  currencies<T>(): Observable<T> {
    return this.http.get<T>(`${this.api}/reference/currencies`);
  }

  countries<T>(): Observable<T> {
    return this.http.get<T>(`${this.api}/reference/countries`);
  }

  bookingBranches<T>(): Observable<T> {
    return this.http.get<T>(`${this.api}/reference/booking-branches`);
  }

  clearingSystems<T>(): Observable<T> {
    return this.http.get<T>(`${this.api}/reference/clearing-systems`);
  }

  banks<T>(page: number, pageSize: number): Observable<T> {
    return this.http.get<T>(
      `${this.api}/reference/banks?page=${page}&pageSize=${pageSize}&query=`,
    );
  }

  ownNostroAccounts<T>(): Observable<T> {
    return this.http.get<T>(`${this.api}/nostro-accounts`);
  }
}
