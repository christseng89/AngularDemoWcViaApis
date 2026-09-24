const request = require('supertest');
const { app } = require('../server');
const { buildVirtualBookingQuote, convertToOwnerCurrency } = require('../virtual-booking-rate');

describe('Balance-owned non-production virtual Currency Exchange', () => {
  const validQuery = {
    amount: '10.00',
    fromCurrency: 'USD',
    toCurrency: 'EUR',
    correlationId: 'corr-001',
    requestAttemptId: 'attempt-001',
    policyVersion: 'v11.15-demo',
    maxStalenessSeconds: '300',
    decisionTime: '2026-09-24T12:00:00.000Z',
  };

  test('returns an Approved fresh BOOKING quote without calling LC Payment', async () => {
    const response = await request(app).get('/api/fx/booking-rate').query(validQuery).expect(200);

    expect(response.headers['x-virtual-fx-adapter']).toBe('true');
    expect(response.body).toMatchObject({
      fromCurrency: 'USD',
      toCurrency: 'EUR',
      requestedAmount: '10.00',
      ratePurpose: 'BOOKING',
      bookingRate: '0.920000',
      convertedAmount: '9.20',
      approvalStatus: 'APPROVED',
      freshnessStatus: 'FRESH',
      rateSource: 'LC_BALANCE_VIRTUAL_FX',
      correlationId: 'corr-001',
      requestAttemptId: 'attempt-001',
      policyVersion: 'v11.15-demo',
    });
  });

  test('preserves an explicit provider BOOKING rate', async () => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, toCurrency: 'GBP' })
      .expect(200);

    expect(response.body).toMatchObject({
      buyRate: '0.780000',
      sellRate: '0.800000',
      bookingRate: '0.785000',
      convertedAmount: '7.85',
      rateOrigin: 'VIRTUAL_EXPLICIT',
    });
  });

  test('rounds once to the owner currency precision', async () => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, amount: '1.00', toCurrency: 'JPY' })
      .expect(200);

    expect(response.body).toMatchObject({ bookingRate: '150.500000', convertedAmount: '151' });
  });

  test('fails closed when the direct USD-to-owner quote is unavailable', async () => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, toCurrency: 'SEK' })
      .expect(503);

    expect(response.body).toMatchObject({
      code: 'FX_RATE_UNAVAILABLE',
      requestAttemptId: 'attempt-001',
    });
  });

  test('fails closed when an Approved quote is incomplete', async () => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, toCurrency: 'AUD' })
      .expect(503);

    expect(response.body).toMatchObject({ code: 'FX_RATE_UNAVAILABLE' });
  });

  test('rejects malformed requests without inventing defaults', async () => {
    const response = await request(app).get('/api/fx/booking-rate').query({ fromCurrency: 'USD' }).expect(400);

    expect(response.body).toMatchObject({ code: 'INVALID_FX_REQUEST' });
  });

  test('rejects a zero allowance amount', async () => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, amount: '0.00' })
      .expect(400);

    expect(response.body).toMatchObject({ code: 'INVALID_FX_REQUEST' });
  });

  test('rejects owner-to-USD direction because allowance conversion is USD-to-owner', async () => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, fromCurrency: 'EUR', toCurrency: 'USD' })
      .expect(400);

    expect(response.body).toMatchObject({ code: 'INVALID_FX_REQUEST' });
  });

  test('returns the provider timeout diagnostic without inventing a quote', async () => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, toCurrency: 'NZD' })
      .expect(503);

    expect(response.body).toMatchObject({ code: 'FX_RATE_UNAVAILABLE', reason: 'TIMEOUT' });
  });

  test.each([
    ['pending approval', 'CAD'],
    ['not yet effective', 'CHF'],
  ])('fails closed for %s evidence', async (_label, toCurrency) => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, toCurrency })
      .expect(503);

    expect(response.body).toMatchObject({ code: 'FX_RATE_UNAVAILABLE' });
  });

  test('returns FX_RATE_STALE when a non-rolling quote exceeds the authorized age', () => {
    const result = buildVirtualBookingQuote({
      quote: {
        bookingRate: '0.920000',
        approvalStatus: 'APPROVED',
        rateScale: 6,
        targetMinorUnits: 2,
        roundingMode: 'ROUND_HALF_UP',
        rateTimestamp: '2026-09-24T11:54:59.000Z',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveTo: '2027-01-01T00:00:00.000Z',
        rateSource: 'LC_BALANCE_VIRTUAL_FX',
        providerRateId: 'STALE-USD-EUR',
        providerRateVersion: '1',
      },
      fromCurrency: 'USD',
      toCurrency: 'EUR',
      expectedTargetMinorUnits: 2,
      amount: '10.00',
      decisionTime: '2026-09-24T12:00:00.000Z',
      correlationId: 'corr-stale',
      requestAttemptId: 'attempt-stale',
      policyVersion: 'v11.15-demo',
      maxStalenessSeconds: '300',
    });

    expect(result).toMatchObject({ error: 'FX_RATE_STALE' });
  });

  test.each([
    ['wrong target precision', { targetMinorUnits: 0 }],
    ['wrong rounding mode', { roundingMode: 'ROUND_DOWN' }],
    ['missing provider id', { providerRateId: ' ' }],
    ['zero booking rate', { bookingRate: '0.000000' }],
    ['malformed booking rate', { bookingRate: 'not-a-rate' }],
    ['invalid timestamp', { rateTimestamp: 'not-a-date' }],
  ])('fails closed for %s', (_label, quoteOverride) => {
    const result = buildVirtualBookingQuote({
      quote: {
        bookingRate: '0.920000',
        approvalStatus: 'APPROVED',
        rateScale: 6,
        targetMinorUnits: 2,
        roundingMode: 'ROUND_HALF_UP',
        rateTimestamp: '2026-09-24T12:00:00.000Z',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveTo: null,
        rateSource: 'LC_BALANCE_VIRTUAL_FX',
        providerRateId: 'VALID-USD-EUR',
        providerRateVersion: '1',
        ...quoteOverride,
      },
      fromCurrency: 'USD',
      toCurrency: 'EUR',
      expectedTargetMinorUnits: 2,
      amount: '10.00',
      decisionTime: '2026-09-24T12:00:00.000Z',
      correlationId: 'corr-invalid',
      requestAttemptId: 'attempt-invalid',
      policyVersion: 'v11.15-demo',
      maxStalenessSeconds: '300',
    });

    expect(result).toMatchObject({ error: 'FX_RATE_UNAVAILABLE' });
  });

  test('uses exact ROUND_HALF_UP for owner-currency precision', () => {
    expect(convertToOwnerCurrency('1.00', '1.234500', 3, 6)).toBe('1.235');
    expect(convertToOwnerCurrency('1.00', '1.234499', 3, 6)).toBe('1.234');
    expect(convertToOwnerCurrency('1.00', '1.000000', 2)).toBe('1.00');
  });
});
