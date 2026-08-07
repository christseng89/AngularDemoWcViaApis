import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';

export interface CurrencyOption {
  label: string;
  value: string;
}

/**
 * "Get Currency API" — GET /api/currencies (lc-payment-wc/backend/server.js),
 * same proxy/no-new-wiring pattern as FxRateService's GET /api/fx/rates. Fake/
 * demo data (backend/data/currencies.json), not traced from a real currency
 * master — the real baseline concept it models is the STAN "Currency Master"
 * function group (X/EE_SYS/FUNCGRP/grp_G49082300152.xml, InquireCurrency
 * F05030701358), a generic framework CRUD screen with no bespoke field list to
 * trace a response shape from. See server.js's doc comment for the full note.
 *
 * Every currency this returns is guaranteed to have a rate in FxRateService's
 * table too — server.js asserts that at startup (data/fx-rates.json must cover
 * every entry in data/currencies.json) — so a value picked from this dropdown
 * never leads to a "no FX rate found" dead end.
 */
@Injectable({ providedIn: 'root' })
export class CurrencyService {
  private cache$?: Observable<string[]>;

  constructor(private readonly http: HttpClient) {}

  codes(): Observable<string[]> {
    if (!this.cache$) {
      this.cache$ = this.http.get<{ currencies: { code: string }[] }>('/api/currencies').pipe(
        map((res) => (res.currencies ?? []).map((c) => c.code)),
        catchError(() => of([])),
        shareReplay(1),
      );
    }
    return this.cache$;
  }

  /** Formly-shaped {label, value} options, for `select` field `props.options`. */
  options(): Observable<CurrencyOption[]> {
    return this.codes().pipe(map((codes) => codes.map((code) => ({ label: code, value: code }))));
  }
}
