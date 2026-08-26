import { domesticNonBusinessDayReason, isWeekend, knownHolidayName } from '../../../src/domain/domesticCalendar';

describe('isWeekend (F1, Expiry Date domestic business-day rule)', () => {
  test('Saturday/Sunday are weekends', () => {
    expect(isWeekend('2026-01-03')).toBe(true); // Saturday
    expect(isWeekend('2026-01-04')).toBe(true); // Sunday
  });

  test('a plain weekday is not a weekend', () => {
    expect(isWeekend('2026-01-08')).toBe(false); // Thursday
  });
});

describe('knownHolidayName', () => {
  test('returns the holiday name for a known domestic public holiday', () => {
    expect(knownHolidayName('2026-01-01')).toBe('元旦');
  });

  test('returns null for a genuine business day', () => {
    expect(knownHolidayName('2026-01-08')).toBeNull();
  });

  test('returns null for a date outside the covered 2026-2028 range — "unknown", not rejected', () => {
    expect(knownHolidayName('2099-01-01')).toBeNull();
  });
});

describe('domesticNonBusinessDayReason', () => {
  test('reports the holiday name when the date is a known public holiday, even on a weekday', () => {
    expect(domesticNonBusinessDayReason('2026-01-01')).toBe('元旦'); // Thursday
  });

  test('reports Saturday/Sunday when the date is a weekend with no matching holiday', () => {
    expect(domesticNonBusinessDayReason('2026-01-03')).toBe('Saturday/Sunday');
  });

  test('returns null for a genuine business day', () => {
    expect(domesticNonBusinessDayReason('2026-01-08')).toBeNull();
  });

  test('the weekend check still applies for a date outside the covered holiday range — only the holiday lookup is "unknown" there', () => {
    expect(domesticNonBusinessDayReason('2099-01-03')).toBe('Saturday/Sunday'); // a Saturday; day-of-week math is valid for any year
  });

  test('a genuine business day in an out-of-range year passes (no holiday to false-match, and it is not a weekend)', () => {
    expect(domesticNonBusinessDayReason('2099-01-05')).toBeNull(); // Monday
  });
});
