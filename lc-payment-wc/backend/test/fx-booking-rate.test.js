const request = require('supertest');
const app = require('../server');
const { buildVirtualBookingQuote } = require('../virtual-booking-rate');

describe('non-production virtual Currency Exchange BOOKING endpoint', () => {
  const validQuery = {
    amount: '10.00',
    correlationId: 'corr-001',
    policyVersion: 'v11.15-test',
    maxStalenessSeconds: '300',
  };

  test('derives BOOKING_RATE as the exact BUY/SELL midpoint when fixture bookingRate is absent', async () => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, base: 'EUR', quote: 'USD', decisionTime: '2026-09-22T00:00:00.000Z' })
      .expect(200);

    expect(response.headers['x-virtual-fx-adapter']).toBe('true');
    expect(response.body).toMatchObject({
      baseCurrency: 'EUR',
      quoteCurrency: 'USD',
      ratePurpose: 'BOOKING',
      buyRate: '1.080000',
      sellRate: '1.100000',
      bookingRate: '1.090000',
      convertedAmount: '10.90',
      rateOrigin: 'VIRTUAL_DERIVED_MID',
      approvalStatus: 'APPROVED',
      freshnessStatus: 'FRESH',
      correlationId: 'corr-001',
      policyVersion: 'v11.15-test',
      rateTimestamp: '2026-09-21T23:59:00.000Z',
    });
  });

  test('preserves an explicit fixture BOOKING_RATE instead of replacing it with the midpoint', async () => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, base: 'GBP', quote: 'USD', decisionTime: '2026-09-22T00:00:00.000Z' })
      .expect(200);

    expect(response.body).toMatchObject({
      buyRate: '1.300000',
      sellRate: '1.320000',
      bookingRate: '1.305000',
      rateOrigin: 'VIRTUAL_EXPLICIT',
    });
  });

  test('returns FX_RATE_UNAVAILABLE when neither explicit booking nor both quote sides are present', async () => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, base: 'AUD', quote: 'USD', decisionTime: '2026-09-22T00:00:00.000Z' })
      .expect(503);

    expect(response.body).toEqual({ code: 'FX_RATE_UNAVAILABLE', message: 'Virtual BOOKING quote is incomplete for AUD/USD.' });
  });

  test('returns FX_RATE_UNAVAILABLE for an unknown pair', async () => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, base: 'XYZ', quote: 'USD', decisionTime: '2026-09-22T00:00:00.000Z' })
      .expect(503);

    expect(response.body.code).toBe('FX_RATE_UNAVAILABLE');
  });

  test('rejects invalid request shape without inventing a default currency or decision time', async () => {
    const response = await request(app).get('/api/fx/booking-rate').query({ base: 'EUR' }).expect(400);
    expect(response.body.code).toBe('INVALID_FX_REQUEST');
  });

  test('returns FX_RATE_STALE using fixture rateTimestamp and request freshness policy', async () => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, base: 'EUR', quote: 'USD', decisionTime: '2026-09-22T00:10:00.000Z' })
      .expect(503);

    expect(response.body.code).toBe('FX_RATE_STALE');
  });

  test.each([
    ['CAD', 'not Approved'],
    ['CHF', 'not Approved/Effective'],
  ])('returns FX_RATE_UNAVAILABLE when %s quote is %s', async (base) => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, base, quote: 'USD', decisionTime: '2026-09-22T00:00:00.000Z' })
      .expect(503);

    expect(response.body.code).toBe('FX_RATE_UNAVAILABLE');
  });

  test('returns FX_RATE_UNAVAILABLE for an injected virtual timeout without inventing a quote', async () => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, base: 'NZD', quote: 'USD', decisionTime: '2026-09-22T00:00:00.000Z' })
      .expect(503);

    expect(response.body).toMatchObject({ code: 'FX_RATE_UNAVAILABLE', reason: 'TIMEOUT' });
  });

  test.each([
    ['invalid effectiveFrom', { effectiveFrom: 'not-a-date' }],
    ['invalid effectiveTo', { effectiveTo: 'not-a-date' }],
    ['invalid rateTimestamp', { rateTimestamp: 'not-a-date' }],
    ['future rateTimestamp', { rateTimestamp: '2026-09-22T00:01:00.000Z' }],
  ])('fails closed for %s fixture evidence', (_label, fixtureOverride) => {
    const result = buildVirtualBookingQuote({
      quote: {
        buyRate: '1.08',
        sellRate: '1.10',
        approvalStatus: 'APPROVED',
        rateTimestamp: '2026-09-21T23:59:00.000Z',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveTo: '2027-01-01T00:00:00.000Z',
        rateSource: 'TEST',
        providerRateId: 'rate-1',
        providerRateVersion: '1',
        rateScale: 6,
        roundingMode: 'ROUND_HALF_UP',
        ...fixtureOverride,
      },
      baseCurrency: 'EUR',
      quoteCurrency: 'USD',
      amount: '10',
      decisionTime: '2026-09-22T00:00:00.000Z',
      correlationId: 'corr-1',
      policyVersion: 'policy-1',
      maxStalenessSeconds: '300',
    });
    expect(result.error).toBe('FX_RATE_UNAVAILABLE');
  });

  test('maps malformed amount to INVALID_FX_REQUEST instead of HTTP 500', async () => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, amount: 'NaN', base: 'EUR', quote: 'USD', decisionTime: '2026-09-22T00:00:00.000Z' })
      .expect(400);
    expect(response.body.code).toBe('INVALID_FX_REQUEST');
  });
});
