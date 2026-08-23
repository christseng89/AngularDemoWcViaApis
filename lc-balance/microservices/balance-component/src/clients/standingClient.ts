/**
 * HTTP client for the external Standing microservice's `POST /business-days/adjust` — see
 * analysis/maturity_date/Standing_Microservice_Maturity_Date_OAS_Design.md (v2.10.0) for the real
 * contract, and `Maturity-Date-Business-Day-Convention-Decision-Request.md` (repo root, resolved
 * 2026-08-23) for why Balance Component calls out to a separate service rather than embedding a holiday
 * calendar itself (GAP-15's own division of responsibility). `microservices/standing-mock/` is a local,
 * simplified stand-in implementing only this one endpoint — point `STANDING_SERVICE_URL` at a real
 * Standing instance later without changing anything in this file or its callers.
 *
 * Retry policy mirrors `lc-balance/backend/server.js`'s own `fetchWithRetry` (2026-08-23, same session) —
 * `/business-days/adjust` is read/computation-only (no side effects, per the design doc's own §3.9), so a
 * bounded retry on a transient connection failure is safe here in a way it would NOT be for a mutating
 * Balance Component call (`.../release` etc.) — see that file's own doc comment for the full idempotency
 * reasoning this mirrors.
 */
import { CalendarServiceError } from '../errors';

const RETRYABLE_ERROR_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET']);
const RETRY_DELAYS_MS = [100, 200]; // 2 retries (3 attempts total), same schedule as backend/server.js's fetchWithRetry

/** design doc §3.1 — request field shapes for `AdjustBusinessDayRequest`. Only the subset this service actually sends. */
export interface StandingCalendarRef {
  calendarType: 'COUNTRY' | 'CURRENCY_CLEARING' | 'INSTITUTION' | 'FINANCIAL_CENTER';
  code: string;
  role: string;
  required?: boolean;
  pathGroup?: string;
}

export interface AdjustBusinessDayRequest {
  sourceDate: string;
  sourceDateType: 'CONTRACTUAL_MATURITY_DATE' | 'EXAMINATION_PERIOD_START' | 'OTHER';
  calculationPurpose: 'OPERATIONAL_PAYMENT_DATE' | 'EXAMINATION_DEADLINE' | 'OTHER';
  currency?: string;
  calendars: StandingCalendarRef[];
  combinationRule: 'ALL_REQUIRED_OPEN' | 'ANY_ELIGIBLE_OPEN';
  convention: 'FOLLOWING' | 'PRECEDING' | 'MODIFIED_FOLLOWING' | 'MODIFIED_PRECEDING' | 'NEAREST';
}

/**
 * Maturity-Date-Tenor-Basis-Decision-Review.md v29 §5 — one calendar's own business-day assessment for
 * the calculation. Loose/string-typed (same convention as MaturityDateCalendarRef in types.ts) — this
 * service persists calendarSnapshotId only (see BalanceContract.calendarSnapshotId in types.ts), never
 * this array; typed here purely so a caller who does want to inspect per-calendar detail gets real
 * fields instead of `unknown`.
 */
export interface CalendarAssessment {
  calendarType: string;
  code: string;
  role?: string;
  businessDay: boolean;
  [key: string]: unknown;
}

/** design doc §3.1 — only the fields this service actually reads out of `AdjustBusinessDayResponse`. */
export interface AdjustBusinessDayResponse {
  calculationId: string;
  adjustedDate: string;
  wasAdjusted: boolean;
  adjustmentDays: number;
  contractualDateChanged: false;
  /** v29 §5 — a single reproducible ID for this whole multi-calendar calculation; persisted so a historical recalculation can pin the exact calendar version originally used. */
  calendarSnapshotId: string;
  /** v29 §5 — each calendar's own version, informational; not persisted on the contract (only calendarSnapshotId is — see the entry above). */
  calendarVersions: Array<{ calendarType: string; code: string; version: string }>;
  calendarAssessments: CalendarAssessment[];
  adjustedDateAssessments: CalendarAssessment[];
  skippedDates: unknown[];
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      const code = (err as { cause?: { code?: string }; code?: string }).cause?.code ?? (err as { code?: string }).code;
      if (!code || !RETRYABLE_ERROR_CODES.has(code) || attempt >= RETRY_DELAYS_MS.length) {
        throw err;
      }
      const delayMs = RETRY_DELAYS_MS[attempt];
      // eslint-disable-next-line no-console
      console.warn(`[standingClient] POST /business-days/adjust failed (${code}); retry ${attempt + 1}/${RETRY_DELAYS_MS.length} in ${delayMs}ms.`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function baseUrl(): string {
  return process.env.STANDING_SERVICE_URL ?? 'http://localhost:4400';
}

/**
 * Calls Standing's `POST /business-days/adjust`. Throws `CalendarServiceError` (mapped to 503, mirroring
 * the real Standing OAS's own `CALENDAR_SERVICE_TIMEOUT`/`CALENDAR_DATA_STALE` 503s, see §3.8) on a
 * connection failure (after retries) or a non-2xx response — this is a deliberate fail-closed choice: a
 * caller that opted into Standing-calculated Maturity Date must never silently fall back to an
 * uncalculated/wrong date just because Standing was unreachable.
 */
export async function adjustBusinessDay(request: AdjustBusinessDayRequest): Promise<AdjustBusinessDayResponse> {
  let res: Response;
  try {
    res = await fetchWithRetry(`${baseUrl()}/business-days/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch (err) {
    throw new CalendarServiceError(`Standing service unreachable at ${baseUrl()}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const json = await res.json().catch((err: unknown) => {
    throw new CalendarServiceError(`Standing returned a non-JSON response (HTTP ${res.status} ${res.statusText}): ${err instanceof Error ? err.message : String(err)}`);
  });
  if (!res.ok) {
    const body = json as { errorCode?: string; message?: string };
    throw new CalendarServiceError(`Standing rejected the request (HTTP ${res.status} ${body.errorCode ?? ''}): ${body.message ?? 'no message'}`, { standingStatus: res.status, standingErrorCode: body.errorCode });
  }
  return json as AdjustBusinessDayResponse;
}
