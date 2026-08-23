import { computeSourceDate, buildAdjustBusinessDayRequest } from '../../../src/domain/maturityDateCalculation';

describe('computeSourceDate (A6/B4 Calculated Maturity Date — plain calendar-day arithmetic, no calendar awareness)', () => {
  test('adds tenorDays calendar days to acceptanceDate', () => {
    expect(computeSourceDate('2026-01-01', 90)).toBe('2026-04-01');
  });

  test('tenorDays=0 returns acceptanceDate unchanged', () => {
    expect(computeSourceDate('2026-06-15', 0)).toBe('2026-06-15');
  });

  test('crosses a month boundary', () => {
    expect(computeSourceDate('2026-01-25', 10)).toBe('2026-02-04');
  });

  test('crosses a year boundary', () => {
    expect(computeSourceDate('2026-12-20', 20)).toBe('2027-01-09');
  });

  test('handles a leap-year February correctly (2028 is a leap year)', () => {
    expect(computeSourceDate('2028-02-20', 10)).toBe('2028-03-01');
  });

  test('rejects a non-YYYY-MM-DD acceptanceDate (e.g. a full ISO timestamp)', () => {
    expect(() => computeSourceDate('2026-01-01T00:00:00.000Z', 90)).toThrow(/plain YYYY-MM-DD date/);
  });

  test('rejects a malformed acceptanceDate string', () => {
    expect(() => computeSourceDate('not-a-date', 90)).toThrow(/plain YYYY-MM-DD date/);
  });

  test('rejects a negative tenorDays', () => {
    expect(() => computeSourceDate('2026-01-01', -5)).toThrow(/non-negative integer/);
  });

  test('rejects a non-integer tenorDays', () => {
    expect(() => computeSourceDate('2026-01-01', 90.5)).toThrow(/non-negative integer/);
  });
});

describe('buildAdjustBusinessDayRequest (design doc §3.1 — AdjustBusinessDayRequest shape)', () => {
  const calendars = [{ calendarType: 'CURRENCY_CLEARING' as const, code: 'USD_FEDWIRE', role: 'CURRENCY_CLEARING', required: true }];

  test('always sends sourceDateType=CONTRACTUAL_MATURITY_DATE / calculationPurpose=OPERATIONAL_PAYMENT_DATE (the design doc\'s own required pairing, §3.1)', () => {
    const req = buildAdjustBusinessDayRequest({ sourceDate: '2026-12-25', calendars });
    expect(req.sourceDateType).toBe('CONTRACTUAL_MATURITY_DATE');
    expect(req.calculationPurpose).toBe('OPERATIONAL_PAYMENT_DATE');
    expect(req.sourceDate).toBe('2026-12-25');
    expect(req.calendars).toBe(calendars);
  });

  test('defaults combinationRule to ALL_REQUIRED_OPEN and convention to FOLLOWING when omitted', () => {
    const req = buildAdjustBusinessDayRequest({ sourceDate: '2026-12-25', calendars });
    expect(req.combinationRule).toBe('ALL_REQUIRED_OPEN');
    expect(req.convention).toBe('FOLLOWING');
  });

  test('honors an explicit combinationRule/convention override', () => {
    const req = buildAdjustBusinessDayRequest({ sourceDate: '2026-12-25', calendars, combinationRule: 'ANY_ELIGIBLE_OPEN', convention: 'NEAREST' });
    expect(req.combinationRule).toBe('ANY_ELIGIBLE_OPEN');
    expect(req.convention).toBe('NEAREST');
  });

  test('carries currency through when supplied, omits it (undefined) when not', () => {
    expect(buildAdjustBusinessDayRequest({ sourceDate: '2026-12-25', currency: 'USD', calendars }).currency).toBe('USD');
    expect(buildAdjustBusinessDayRequest({ sourceDate: '2026-12-25', calendars }).currency).toBeUndefined();
  });
});
