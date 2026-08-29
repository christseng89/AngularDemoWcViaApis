/**
 * User-directed 2026-08-26 ("Expiry Date也不可以是本國的假日或周末... FOR A1 B1... UI API都需要") —
 * A1/B1's own Expiry Date (UCP 600 Art.6(d)) must fall on a genuine domestic business day, not a
 * Saturday/Sunday or a public holiday.
 *
 * Reuses the SAME single-domestic-calendar (Taiwan) data `microservices/business-days-mock/data/
 * calendar.json` already carries for the F1 §13.5 Auto Close Grace Period Phase 2 reference material —
 * copied here rather than called over HTTP, same "Phase 1, same-repo, no cross-service call" posture
 * `autoCloseGracePeriod.ts`'s own `addBusinessDays()` already established for that unrelated feature.
 * Deliberately NOT wired through `business-days-mock` itself (still un-integrated reference material for
 * a hypothetical future phase — see that service's own README) or through the Auto Close Grace Period's
 * own weekend-only Phase 1 stand-in (a DIFFERENT calendar concern: that one walks forward N business days
 * from a system-computed timestamp; this one validates a single human-typed date against public
 * holidays too, which that Phase 1 stand-in deliberately does not attempt).
 *
 * 2026-2028 holiday coverage only (illustrative test data, not an authoritative feed — same disclaimer
 * as the source file). A year outside that range simply has no KNOWN holiday to flag — the weekend check
 * still applies (pure day-of-week arithmetic, valid for any year), only the holiday check silently has
 * nothing to match against. This is a deliberate "don't false-reject" default for a human-typed field —
 * unlike the AUTO CLOSE sweep's own fail-closed CALENDAR_RANGE_EXCEEDED guard (business-days-mock/
 * server.js), which exists because THAT caller can't safely proceed at all without a real answer; here,
 * silently allowing an unverifiable far-future date is the safer failure mode than blocking every LC with
 * a multi-year tenor.
 */

import { DOMESTIC_HOLIDAYS as GENERATED_DOMESTIC_HOLIDAYS, type DomesticHoliday } from './domesticHolidays.generated';

// Keep in sync by hand with microservices/business-days-mock/data/calendar.json — see this file's own
// top doc comment for why this is a copy, not a shared import (separate deployable microservices).
const DOMESTIC_HOLIDAYS: readonly DomesticHoliday[] = [
  { date: '2026-01-01', name: '元旦' },
  { date: '2026-02-16', name: '除夕' },
  { date: '2026-02-17', name: '春節' },
  { date: '2026-02-18', name: '春節連假' },
  { date: '2026-02-19', name: '春節連假' },
  { date: '2026-02-28', name: '和平紀念日' },
  { date: '2026-04-03', name: '兒童節附放' },
  { date: '2026-04-06', name: '清明節' },
  { date: '2026-05-01', name: '勞動節' },
  { date: '2026-06-19', name: '端午節' },
  { date: '2026-09-25', name: '中秋節' },
  { date: '2026-10-10', name: '國慶日' },
  { date: '2027-01-01', name: '元旦' },
  { date: '2027-02-16', name: '除夕' },
  { date: '2027-02-17', name: '春節' },
  { date: '2027-02-18', name: '春節連假' },
  { date: '2027-02-19', name: '春節連假' },
  { date: '2027-02-28', name: '和平紀念日' },
  { date: '2027-04-05', name: '兒童節附放' },
  { date: '2027-04-06', name: '清明節' },
  { date: '2027-05-01', name: '勞動節' },
  { date: '2027-06-21', name: '端午節' },
  { date: '2027-09-27', name: '中秋節' },
  { date: '2027-10-10', name: '國慶日' },
  { date: '2028-01-01', name: '元旦' },
  { date: '2028-02-16', name: '除夕' },
  { date: '2028-02-17', name: '春節' },
  { date: '2028-02-18', name: '春節連假' },
  { date: '2028-02-21', name: '春節連假' },
  { date: '2028-02-28', name: '和平紀念日' },
  { date: '2028-04-03', name: '兒童節附放' },
  { date: '2028-04-06', name: '清明節' },
  { date: '2028-05-01', name: '勞動節' },
  { date: '2028-06-19', name: '端午節' },
  { date: '2028-09-25', name: '中秋節' },
  { date: '2028-10-10', name: '國慶日' },
];

const HOLIDAYS_BY_DATE: ReadonlyMap<string, string> = new Map(GENERATED_DOMESTIC_HOLIDAYS.map((h) => [h.date, h.name]));

/** `dateStr` must be `YYYY-MM-DD`. Parsed as UTC so this is stable regardless of server timezone. */
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
 * BEFORE holiday (cheap day-of-week arithmetic vs. a Map lookup) — matches
 * `microservices/business-days-mock/server.js`'s own check order; a fixed statutory holiday that
 * happens to fall on a weekend (e.g. 2027-10-10, 國慶日/Sunday) reports "Saturday/Sunday" here, same as
 * that mock. Either order reaches the same accept/reject outcome — only the reported reason text differs.
 */
export function domesticNonBusinessDayReason(dateStr: string): string | null {
  if (isWeekend(dateStr)) return 'Saturday/Sunday';
  return knownHolidayName(dateStr);
}
