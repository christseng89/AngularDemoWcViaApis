'use strict';

const request = require('supertest');
const app = require('../server');

/**
 * Covers `POST /business-days/add`'s own behavior end to end — the weekend/holiday skip walk, the
 * fail-closed calendar-range guard (BA-flagged gap, fixed 2026-08-26), and basic input validation. Same
 * "real HTTP integration test, no mocking" convention `microservices/balance-component/test/unit/
 * app.test.ts` uses — this is a small standalone mock, not part of that project's own 95%-gated suite.
 */

describe('POST /business-days/add', () => {
  test('skips a weekend — 2026-01-08 (Thu) + 2 business days lands on 2026-01-12 (Mon)', async () => {
    const res = await request(app).post('/business-days/add').send({ date: '2026-01-08', businessDays: 2 });
    expect(res.status).toBe(200);
    expect(res.body.adjustedDate).toBe('2026-01-12');
    expect(res.body.skippedDates).toEqual([
      { date: '2026-01-10', reasonCode: 'WEEKEND', reasonDescription: 'Weekend (SAT)' },
      { date: '2026-01-11', reasonCode: 'WEEKEND', reasonDescription: 'Weekend (SUN)' },
    ]);
  });

  test('skips a real holiday — crosses the 2026/2027 year boundary, skipping New Year + the weekend around it', async () => {
    const res = await request(app).post('/business-days/add').send({ date: '2026-12-31', businessDays: 1 });
    expect(res.status).toBe(200);
    expect(res.body.adjustedDate).toBe('2027-01-04');
    expect(res.body.skippedDates.map((s) => s.reasonCode)).toEqual(['PUBLIC_HOLIDAY', 'WEEKEND', 'WEEKEND']);
  });

  test('businessDays: 0 returns the same date unchanged, with no skippedDates', async () => {
    const res = await request(app).post('/business-days/add').send({ date: '2026-03-02', businessDays: 0 });
    expect(res.status).toBe(200);
    expect(res.body.adjustedDate).toBe('2026-03-02');
    expect(res.body.skippedDates).toEqual([]);
  });

  test('a repeated 2027 holiday that fell on a weekend was correctly rolled forward — Dragon Boat 06-19 (Sat) -> 06-21 (Mon)', async () => {
    const res = await request(app).post('/business-days/add').send({ date: '2027-06-17', businessDays: 2 });
    expect(res.status).toBe(200);
    expect(res.body.adjustedDate).toBe('2027-06-22');
    expect(res.body.skippedDates).toContainEqual({ date: '2027-06-21', reasonCode: 'PUBLIC_HOLIDAY', reasonDescription: '端午節' });
  });

  test('a fixed statutory holiday (National Day, 10-10) is never rolled even when it lands on a weekend — 2027-10-10 is a Sunday, reported as WEEKEND not PUBLIC_HOLIDAY', async () => {
    const res = await request(app).post('/business-days/add').send({ date: '2027-10-08', businessDays: 2 });
    expect(res.status).toBe(200);
    expect(res.body.skippedDates).toEqual([
      { date: '2027-10-09', reasonCode: 'WEEKEND', reasonDescription: 'Weekend (SAT)' },
      { date: '2027-10-10', reasonCode: 'WEEKEND', reasonDescription: 'Weekend (SUN)' },
    ]);
  });

  describe('validation', () => {
    test('rejects a malformed date', async () => {
      const res = await request(app).post('/business-days/add').send({ date: 'not-a-date', businessDays: 1 });
      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('INVALID_DATE_FORMAT');
    });

    test('rejects a calendar overflow date (e.g. 2026-02-30) even though it matches YYYY-MM-DD', async () => {
      const res = await request(app).post('/business-days/add').send({ date: '2026-02-30', businessDays: 1 });
      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('INVALID_DATE_FORMAT');
    });

    test('rejects a negative businessDays', async () => {
      const res = await request(app).post('/business-days/add').send({ date: '2026-01-08', businessDays: -1 });
      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('INVALID_BUSINESS_DAYS');
    });

    test('rejects a non-integer businessDays', async () => {
      const res = await request(app).post('/business-days/add').send({ date: '2026-01-08', businessDays: 1.5 });
      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('INVALID_BUSINESS_DAYS');
    });
  });

  describe('fail-closed calendar-range guard (BA-flagged gap, fixed 2026-08-26)', () => {
    test('rejects an input date after the known calendar coverage (2029, calendar.json only covers 2026-2028)', async () => {
      const res = await request(app).post('/business-days/add').send({ date: '2029-01-01', businessDays: 1 });
      expect(res.status).toBe(422);
      expect(res.body.errorCode).toBe('CALENDAR_RANGE_EXCEEDED');
    });

    test('rejects an input date before the known calendar coverage (2025)', async () => {
      const res = await request(app).post('/business-days/add').send({ date: '2025-12-31', businessDays: 1 });
      expect(res.status).toBe(422);
      expect(res.body.errorCode).toBe('CALENDAR_RANGE_EXCEEDED');
    });

    test('rejects a walk that would need to cross past the last covered date, even though the input date itself is in range', async () => {
      const res = await request(app).post('/business-days/add').send({ date: '2028-12-30', businessDays: 5 });
      expect(res.status).toBe(422);
      expect(res.body.errorCode).toBe('CALENDAR_RANGE_EXCEEDED');
    });

    test('businessDays: 0 at the very last covered date still succeeds trivially (no walk needed)', async () => {
      const res = await request(app).post('/business-days/add').send({ date: '2028-12-31', businessDays: 0 });
      expect(res.status).toBe(200);
      expect(res.body.adjustedDate).toBe('2028-12-31');
    });

    test('a genuinely resolvable near-boundary walk still succeeds (does not over-trigger the guard)', async () => {
      const res = await request(app).post('/business-days/add').send({ date: '2028-12-27', businessDays: 2 });
      expect(res.status).toBe(200);
      expect(res.body.adjustedDate).toBe('2028-12-29');
    });
  });
});

describe('GET /healthz', () => {
  test('reports ok with the configured calendar code', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', calendarCode: 'TW' });
  });
});
