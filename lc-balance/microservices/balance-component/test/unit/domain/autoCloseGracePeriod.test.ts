import { addBusinessDays, isPastAutoCloseGrace } from '../../../src/domain/autoCloseGracePeriod';

describe('addBusinessDays (F1 proposal §13.5, Phase 1 weekend-only mock)', () => {
  test('adding 0 business days returns the same instant', () => {
    expect(addBusinessDays(new Date('2026-01-05T12:00:00Z'), 0).toISOString()).toBe('2026-01-05T12:00:00.000Z');
  });

  test('adding business days within the same work week skips no days', () => {
    // 2026-01-05 is a Monday.
    expect(addBusinessDays(new Date('2026-01-05T00:00:00Z'), 3).toISOString().slice(0, 10)).toBe('2026-01-08');
  });

  test('skips a weekend that falls within the span', () => {
    // 2026-01-08 is a Thursday; +2 business days lands on Monday 2026-01-12, skipping Sat/Sun.
    expect(addBusinessDays(new Date('2026-01-08T00:00:00Z'), 2).toISOString().slice(0, 10)).toBe('2026-01-12');
  });

  test('starting on a Saturday still counts only business days forward', () => {
    // 2026-01-10 is a Saturday; +1 business day should land on Monday 2026-01-12.
    expect(addBusinessDays(new Date('2026-01-10T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-01-12');
  });

  test('preserves the time-of-day component', () => {
    expect(addBusinessDays(new Date('2026-01-05T09:30:00Z'), 1).toISOString()).toBe('2026-01-06T09:30:00.000Z');
  });
});

describe('isPastAutoCloseGrace (F1 proposal §13.5, BA-ratified 2026-08-25) — Auto Close Grace Period, business-day gate off effectiveTo', () => {
  test('false when effectiveTo is null/undefined — never AUTO CLOSE-eligible without a "became EXPIRED at" anchor', () => {
    expect(isPastAutoCloseGrace(null, 2, new Date('2026-01-10'))).toBe(false);
    expect(isPastAutoCloseGrace(undefined, 2, new Date('2026-01-10'))).toBe(false);
  });

  test('false immediately after becoming EXPIRED, same sweep cycle — the §8.5 gap this feature closes', () => {
    // Monday 2026-01-05T10:00:00Z became EXPIRED; a sweep running seconds later must not yet be eligible.
    expect(isPastAutoCloseGrace('2026-01-05T10:00:00Z', 2, new Date('2026-01-05T10:00:30Z'))).toBe(false);
  });

  test('false while still within the N-business-day grace window', () => {
    // Monday + 1 business day = Tuesday; asOf Tuesday morning is still within a 2-business-day grace.
    expect(isPastAutoCloseGrace('2026-01-05T10:00:00Z', 2, new Date('2026-01-06T10:00:00Z'))).toBe(false);
  });

  test('false exactly at the grace boundary (not yet past it)', () => {
    expect(isPastAutoCloseGrace('2026-01-05T10:00:00Z', 2, new Date('2026-01-07T10:00:00Z'))).toBe(false);
  });

  test('true one millisecond past the grace boundary', () => {
    expect(isPastAutoCloseGrace('2026-01-05T10:00:00Z', 2, new Date('2026-01-07T10:00:00.001Z'))).toBe(true);
  });

  test('correctly spans a weekend — becoming EXPIRED on a Friday with a 2-business-day grace is not eligible until the following Tuesday', () => {
    // Friday 2026-01-09T10:00:00Z + 2 business days = Tuesday 2026-01-13T10:00:00Z.
    expect(isPastAutoCloseGrace('2026-01-09T10:00:00Z', 2, new Date('2026-01-12T10:00:00Z'))).toBe(false); // Monday — still short
    expect(isPastAutoCloseGrace('2026-01-09T10:00:00Z', 2, new Date('2026-01-13T10:00:00.001Z'))).toBe(true); // just past Tuesday boundary
  });

  test('zero grace days — eligible the instant effectiveTo itself passes', () => {
    expect(isPastAutoCloseGrace('2026-01-05T10:00:00Z', 0, new Date('2026-01-05T10:00:00Z'))).toBe(false);
    expect(isPastAutoCloseGrace('2026-01-05T10:00:00Z', 0, new Date('2026-01-05T10:00:00.001Z'))).toBe(true);
  });
});
