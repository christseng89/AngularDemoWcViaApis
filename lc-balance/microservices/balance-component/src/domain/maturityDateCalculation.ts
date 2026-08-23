/**
 * A6/B4 Calculated Maturity Date — `A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md` §2/§3:
 * `Calculated Maturity Date = Acceptance Date + tenorDays + Business Day Convention`. The first half
 * (`sourceDate = Acceptance Date + tenorDays`) is plain calendar-day arithmetic and stays Trade Finance's
 * own responsibility — pure, no I/O, testable without a network call. The second half (Business Day
 * Convention/holiday-calendar adjustment) is NOT computed here — see `clients/standingClient.ts` and
 * `service/balanceService.ts`'s `calculateAcceptanceMaturityDate()`, which calls out to the external
 * Standing microservice for that part (GAP-15 keeps holiday-calendar logic out of this service).
 */
import type { StandingCalendarRef, AdjustBusinessDayRequest } from '../clients/standingClient';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `acceptanceDate + tenorDays` calendar days — plain arithmetic, no calendar/business-day awareness. */
export function computeSourceDate(acceptanceDate: string, tenorDays: number): string {
  const match = DATE_PATTERN.exec(acceptanceDate);
  if (!match) {
    throw new RangeError(`acceptanceDate must be a plain YYYY-MM-DD date, got "${acceptanceDate}".`);
  }
  if (!Number.isInteger(tenorDays) || tenorDays < 0) {
    throw new RangeError(`tenorDays must be a non-negative integer, got ${tenorDays}.`);
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + tenorDays);
  return date.toISOString().slice(0, 10);
}

/**
 * Builds the `POST /business-days/adjust` request. `contractualDateChanged` in Standing's own response is
 * always `false` regardless of what's sent here — this service still passes
 * `sourceDateType=CONTRACTUAL_MATURITY_DATE`/`calculationPurpose=OPERATIONAL_PAYMENT_DATE` (the design
 * doc's own required pairing, §3.1) so Standing's own audit trail records why the calculation ran.
 */
export function buildAdjustBusinessDayRequest(params: {
  sourceDate: string;
  currency?: string;
  calendars: StandingCalendarRef[];
  combinationRule?: AdjustBusinessDayRequest['combinationRule'];
  convention?: AdjustBusinessDayRequest['convention'];
}): AdjustBusinessDayRequest {
  return {
    sourceDate: params.sourceDate,
    sourceDateType: 'CONTRACTUAL_MATURITY_DATE',
    calculationPurpose: 'OPERATIONAL_PAYMENT_DATE',
    currency: params.currency,
    calendars: params.calendars,
    combinationRule: params.combinationRule ?? 'ALL_REQUIRED_OPEN',
    convention: params.convention ?? 'FOLLOWING',
  };
}
