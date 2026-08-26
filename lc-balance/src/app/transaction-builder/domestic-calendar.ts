/**
 * User-directed 2026-08-26 ("Expiry Date也不可以是本國的假日或周末... FOR A1 B1... UI API都需要") — client-side
 * mirror of `microservices/balance-component/src/domain/domesticCalendar.ts`. Kept as a hand-synced copy,
 * not a shared import — these are two independently-deployable projects (Angular app vs. microservice),
 * same "copy, not shared import" posture that file's own top doc comment already establishes for its own
 * relationship to `microservices/business-days-mock/data/calendar.json`.
 *
 * This is a client-side CONVENIENCE (immediate feedback before Submit) — the microservice's own copy is
 * the authoritative enforcement; this one existing does not relax that server-side check at all.
 */

interface DomesticHoliday {
  date: string; // YYYY-MM-DD
  name: string;
}

// Keep in sync by hand with microservices/balance-component/src/domain/domesticCalendar.ts.
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

const HOLIDAYS_BY_DATE: ReadonlyMap<string, string> = new Map(DOMESTIC_HOLIDAYS.map((h) => [h.date, h.name]));

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
