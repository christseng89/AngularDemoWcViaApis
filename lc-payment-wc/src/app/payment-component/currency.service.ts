import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';

export interface CurrencyOption {
  label: string;
  value: string;
}

interface CurrencyRecord {
  code: string;
  decimals?: number;
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
  private cache$?: Observable<CurrencyRecord[]>;

  constructor(private readonly http: HttpClient) {}

  private records(): Observable<CurrencyRecord[]> {
    if (!this.cache$) {
      this.cache$ = this.http.get<{ currencies: CurrencyRecord[] }>('/api/currencies').pipe(
        map((res) => res.currencies ?? []),
        catchError(() => of([])),
        shareReplay(1),
      );
    }
    return this.cache$;
  }

  codes(): Observable<string[]> {
    return this.records().pipe(map((records) => records.map((c) => c.code)));
  }

  /** Formly-shaped {label, value} options, for `select` field `props.options`. */
  options(): Observable<CurrencyOption[]> {
    return this.codes().pipe(map((codes) => codes.map((code) => ({ label: code, value: code }))));
  }

  /**
   * Minor-unit decimal places per currency code (JPY/TWD/IDR = 0, most others
   * = 2 — backend/data/currencies.json), sourced from the SAME /api/currencies
   * response codes()/options() use, so a currency's rounding always agrees
   * with what's offered in its own dropdown. Falls back to 2 for a currency
   * missing a decimals field, matching the demo backend's own dp(ccy)
   * fallback (server.js) — used wherever a computed (not directly
   * user-entered) monetary amount needs currency-correct rounding, e.g.
   * business-case-runner.component.ts's Suspense-entry FX-equivalent
   * calculation, so it agrees with the microservice's own currency-scale
   * rounding for the same computation (domain/suspenseBridge.ts).
   */
  decimals(): Observable<Record<string, number>> {
    return this.records().pipe(map((records) => Object.fromEntries(records.map((c) => [c.code, c.decimals ?? 2]))));
  }
}
