import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';

/**
 * Reuses the SAME GET /api/fx/rates endpoint the original lc-payment-wc web
 * components already call (lc-payment-wc/backend/server.js — proxied via the
 * existing `/api` proxy entry, no new wiring needed) — per the user's request
 * to fetch exchange rates "same as the original Angular Project" rather than
 * having the Payment Component Simulator invent its own source.
 *
 * The backend's rate table is TWD-quoted (`"USD/TWD": 32.50`, etc., covering
 * USD/EUR/JPY/GBP/TWD only). A cross rate between any two of those currencies
 * is derived by bridging through TWD.
 */
@Injectable({ providedIn: 'root' })
export class FxRateService {
  private cache$?: Observable<Record<string, number>>;

  constructor(private readonly http: HttpClient) {}

  rates(): Observable<Record<string, number>> {
    if (!this.cache$) {
      this.cache$ = this.http.get<{ rates: Record<string, number> }>('/api/fx/rates').pipe(
        map((res) => res.rates ?? {}),
        catchError(() => of({})),
        shareReplay(1),
      );
    }
    return this.cache$;
  }

  /**
   * How many units of `to` per 1 unit of `from` — i.e. the multiplier
   * PaymentLegInput's drBuyRate/crBuyRate expects (amountAccountCcy =
   * amountTxCcy × rate, per money.ts's convertTxCcyToAccountCcy). Returns
   * null if either currency isn't in the backend's rate table (the demo
   * only covers USD/EUR/JPY/GBP/TWD) — callers should leave the rate as a
   * manually-editable field in that case, not silently default to 1.
   */
  crossRate(rates: Record<string, number>, from: string, to: string): number | null {
    if (from === to) return 1;
    const fromTwd = this.toTwd(rates, from);
    const toTwd = this.toTwd(rates, to);
    if (fromTwd === null || toTwd === null) return null;
    return fromTwd / toTwd;
  }

  private toTwd(rates: Record<string, number>, ccy: string): number | null {
    if (ccy === 'TWD') return 1;
    const key = `${ccy}/TWD`;
    if (rates[key] !== undefined) return rates[key];
    const inv = `TWD/${ccy}`;
    if (rates[inv] !== undefined) return 1 / rates[inv];
    return null;
  }
}
