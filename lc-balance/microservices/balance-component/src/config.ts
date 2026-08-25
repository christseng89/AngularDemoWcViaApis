/**
 * F1 (external BA review, 2026-08-25) — AUTO EXPIRY / AUTO CLOSE configuration. Hardcoded stand-in for
 * a real ops-config source (env vars / config service), same posture as this repo's other hardcoded
 * stand-ins (FX rates, customer spread tiers elsewhere in the monorepo) — replace before any real use.
 *
 * `MAIL_FLOAT_GRACE_DAYS` is deliberately split by side (Import vs. Export can legitimately use
 * different mail-float grace periods — user-confirmed) and is captured onto each contract at ISSUE
 * time (see types.ts's BalanceContract.mailFloatGraceDays doc comment) rather than read live at sweep
 * time, so a later change here never retroactively shifts an already-booked LC's own expiry-release
 * timing.
 *
 * `BATCH_MAKER_ACTOR`/`BATCH_CHECKER_ACTOR` are the two distinct system-actor identifiers AUTO EXPIRY/
 * AUTO CLOSE use as `createdBy`/`releasedBy` — two different strings so the existing, unmodified
 * `assertMakerCheckerSeparation()` check is satisfied without any "system bypass" carve-out (see
 * domain/statusTransition.ts).
 */

export type IntervalUnit = 'seconds' | 'minutes' | 'hours' | 'days';

export interface SweepInterval {
  value: number;
  unit: IntervalUnit;
}

const UNIT_TO_MS: Readonly<Record<IntervalUnit, number>> = {
  seconds: 1_000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

/** Converts a {value, unit} SweepInterval into the milliseconds setInterval() needs. */
export function toIntervalMs(interval: SweepInterval): number {
  return interval.value * UNIT_TO_MS[interval.unit];
}

/**
 * Demo/dev default: every 30 seconds, so the sweep's effect is observable in a live `npm run dev:all`
 * session without a long wait. A real deployment would set this to `{ value: 1, unit: 'days' }` — only
 * this one value needs to change, not any code.
 */
export const EXPIRY_SWEEP_INTERVAL: SweepInterval = { value: 30, unit: 'seconds' };

/** Import vs. Export mail-float grace period, in days — see this file's own top doc comment. */
export const MAIL_FLOAT_GRACE_DAYS: Readonly<{ IMPORT: number; EXPORT: number }> = {
  IMPORT: 5,
  EXPORT: 5,
};

export const BATCH_MAKER_ACTOR = 'BATCH_MAKER';
export const BATCH_CHECKER_ACTOR = 'BATCH_CHECKER';

/**
 * BA §7.3 — EXPIRE has real accounting/regulatory impact (writes off contingent liability); CLOSE is
 * only a status finalization on an already-EXPIRED (already-zero-balance-impact) contract. Independent
 * flags so AUTO EXPIRY can be enabled and observed before AUTO CLOSE is turned on.
 */
export const AUTO_EXPIRY_ENABLED = true;
export const AUTO_CLOSE_ENABLED = true;

/**
 * F1 proposal §13.1 item 4, BA-ratified 2026-08-25 — AUTO CLOSE always supplies this fixed reasonCode
 * internally (see BalanceService.processSweepCandidate()); a human A10/B6 submission must supply its own
 * instead (BalanceService.assertReasonCodeRequired() rejects a bare one).
 */
export const AUTO_CLOSE_REASON_CODE = 'NATURAL_EXPIRY_ALL_BALANCES_CLEARED';

/**
 * F1 proposal §13.5, BA-ratified 2026-08-25 — Auto Close Grace Period: AUTO CLOSE only picks up a
 * contract once `Business Date > (the date it became EXPIRED) + N bank BUSINESS days` — deliberately
 * independent of `MAIL_FLOAT_GRACE_DAYS` above (that one gates AUTO EXPIRY itself, in calendar days, off
 * `expiryDate`; this one gates AUTO CLOSE, in business days, off `effectiveTo` — two different rules for
 * two different events, per this file's own top doc comment's convention, never conflated). Business-day
 * math is delegated to `domain/autoCloseGracePeriod.ts`'s `addBusinessDays()` — a Phase 1 same-repo
 * "weekend-only" mock standing in for the not-yet-built "Standing" microservice BA's proposal envisions
 * (Phase 2); replace `addBusinessDays()`'s own implementation with a real call once that service exists,
 * this constant itself doesn't need to change.
 */
export const AUTO_CLOSE_GRACE_PERIOD_BUSINESS_DAYS = 2;
