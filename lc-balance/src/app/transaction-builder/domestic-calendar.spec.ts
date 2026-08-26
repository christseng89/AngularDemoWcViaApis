import { domesticNonBusinessDayReason, isWeekend, knownHolidayName } from './domestic-calendar';

describe('isWeekend', () => {
  it('flags Saturday/Sunday', () => {
    expect(isWeekend('2026-01-03')).toBe(true);
    expect(isWeekend('2026-01-04')).toBe(true);
  });

  it('does not flag a plain weekday', () => {
    expect(isWeekend('2026-01-08')).toBe(false);
  });
});

describe('knownHolidayName', () => {
  it('returns the holiday name for a known domestic public holiday', () => {
    expect(knownHolidayName('2026-01-01')).toBe('元旦');
  });

  it('returns null for a genuine business day', () => {
    expect(knownHolidayName('2026-01-08')).toBeNull();
  });

  it('returns null for a date outside the covered 2026-2028 range', () => {
    expect(knownHolidayName('2099-01-01')).toBeNull();
  });
});

describe('domesticNonBusinessDayReason', () => {
  it('reports the holiday name even on a weekday', () => {
    expect(domesticNonBusinessDayReason('2026-01-01')).toBe('元旦');
  });

  it('reports Saturday/Sunday for a weekend with no matching holiday', () => {
    expect(domesticNonBusinessDayReason('2026-01-03')).toBe('Saturday/Sunday');
  });

  it('returns null for a genuine business day', () => {
    expect(domesticNonBusinessDayReason('2026-01-08')).toBeNull();
  });

  it('reports Saturday/Sunday, not the holiday name, when a fixed statutory holiday falls on a weekend', () => {
    // 2027-10-10 (國慶日) is a Sunday — weekend is checked first, matching business-days-mock/server.js.
    expect(domesticNonBusinessDayReason('2027-10-10')).toBe('Saturday/Sunday');
  });
});
