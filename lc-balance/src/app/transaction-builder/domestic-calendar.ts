/**
 * User-directed 2026-08-26 ("Expiry Date也不可以是本國的假日或周末... FOR A1 B1... UI API都需要") — client-side
 * mirror of `microservices/balance-component/src/domain/domesticCalendar.ts`. Holiday data is generated
 * from the repository's canonical `microservices/business-days-mock/data/calendar.json` before test/build.
 *
 * This is a client-side CONVENIENCE (immediate feedback before Submit) — the microservice's own copy is
 * the authoritative enforcement; this one existing does not relax that server-side check at all.
 */

import { DOMESTIC_HOLIDAYS as GENERATED_DOMESTIC_HOLIDAYS } from './domestic-holidays.generated';

// Holiday data is generated from the repository's canonical calendar; the former hand-maintained copy was dead code.

const HOLIDAYS_BY_DATE: ReadonlyMap<string, string> = new Map(GENERATED_DOMESTIC_HOLIDAYS.map((h) => [h.date, h.name]));

/** `dateStr` must be `YYYY-MM-DD`. Parsed as UTC so this is stable regardless of browser timezone. */
export function isWeekend(dateStr: string): boolean {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/** Returns the holiday's own name when `dateStr` is a known domestic public holiday, else `null` — including when the date falls outside the 2026-2028 covered range (see this file's own top doc comment on why that's "unknown", not "rejected"). */
export function knownHolidayName(dateStr: string): string | null {
  return HOLIDAYS_BY_DATE.get(dateStr) ?? null;
}

/**
 * `null` when `dateStr` is a genuine domestic business day; otherwise a human-readable reason
 * ("Saturday/Sunday" or the holiday's own name) suitable for a rejection message. Checks weekend
 * BEFORE holiday — kept in sync with the microservice's own copy and its own check-order rationale.
 */
export function domesticNonBusinessDayReason(dateStr: string): string | null {
  if (isWeekend(dateStr)) return 'Saturday/Sunday';
  return knownHolidayName(dateStr);
}
