/**
 * F1 proposal §13.5 (BA-ratified 2026-08-25) — AUTO CLOSE's own "Auto Close Grace Period" gate: a
 * contract that reached `EXPIRED` (via AUTO EXPIRY, or via A11/B7 Reopen restoring to EXPIRED, §9.2
 * Option A) only becomes AUTO CLOSE-eligible once `Business Date > (the moment it became EXPIRED) + N
 * bank BUSINESS days` — deliberately measured in business days, not the calendar-day
 * `mail_float_grace_days` AUTO EXPIRY itself already uses (see `expiryEligibility.ts`'s own
 * `isPastExpiryGrace()`); the two gate two different events and must never be conflated (config.ts's own
 * top doc comment).
 *
 * "The moment it became EXPIRED" is the contract's own `effectiveTo` — `markExpired()` stamps it for a
 * genuine AUTO EXPIRY, and `reactivate()` stamps it for a REOPEN that restores back to EXPIRED (F1
 * proposal §13.7, fixed 2026-08-25 — previously left `NULL` there, which this gate could not have used
 * as an anchor).
 *
 * `addBusinessDays()` is a deliberate Phase 1 stand-in: BA's proposal envisions this arithmetic being
 * delegated to a separate "Standing" microservice (holiday calendars, region-specific business-day
 * rules) that doesn't exist in this repo — Phase 1 here is the simplest thing that's still genuinely
 * business-day (not calendar-day) math: skip Saturday/Sunday, no holiday calendar. Swap this function's
 * own body for a real call once that service exists; nothing else in this file or its caller needs to
 * change.
 */

/** Adds `days` BUSINESS days (Mon-Fri) to `date`, skipping Saturday/Sunday. `days` must be >= 0. */
export function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  let remaining = days;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const dayOfWeek = result.getUTCDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) remaining -= 1;
  }
  return result;
}

/**
 * `effectiveTo` is a full ISO datetime (or YYYY-MM-DD) string — the contract's own "became EXPIRED at"
 * anchor, see this file's own top doc comment. Returns `false` (not past grace, i.e. AUTO CLOSE must NOT
 * yet pick this contract up) when `effectiveTo` is null/undefined — a defensive default only; every
 * genuinely EXPIRED contract has one, post-§13.7.
 */
export function isPastAutoCloseGrace(effectiveTo: string | null | undefined, graceBusinessDays: number, asOf: Date): boolean {
  if (!effectiveTo) return false;
  const becameExpiredAt = new Date(effectiveTo);
  const graceEnd = addBusinessDays(becameExpiredAt, graceBusinessDays);
  return asOf.getTime() > graceEnd.getTime();
}
