const request = require('supertest');
const app = require('../server');
const { buildVirtualBookingQuote, convertToOwnerCurrency } = require('../virtual-booking-rate');

describe('non-production virtual Currency Exchange BOOKING endpoint', () => {
  const validQuery = {
    amount: '10.00',
    fromCurrency: 'USD',
    toCurrency: 'EUR',
    correlationId: 'corr-001',
    requestAttemptId: 'attempt-001',
    policyVersion: 'v11.15-test',
    maxStalenessSeconds: '300',
  };

  test('derives BOOKING_RATE as the exact BUY/SELL midpoint when fixture bookingRate is absent', async () => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, decisionTime: '2026-09-23T13:00:00.000Z' })
      .expect(200);

    expect(response.headers['x-virtual-fx-adapter']).toBe('true');
    expect(response.body).toMatchObject({
      fromCurrency: 'USD',
      toCurrency: 'EUR',
      requestedAmount: '10.00',
      ratePurpose: 'BOOKING',
      buyRate: '0.910000',
      sellRate: '0.930000',
      bookingRate: '0.920000',
      convertedAmount: '9.20',
      rateOrigin: 'DERIVED_MID',
      approvalStatus: 'APPROVED',
      freshnessStatus: 'FRESH',
      correlationId: 'corr-001',
      requestAttemptId: 'attempt-001',
      policyVersion: 'v11.15-test',
      rateTimestamp: '2026-09-23T13:00:00.000Z',
    });
  });

  test('preserves an explicit fixture BOOKING_RATE instead of replacing it with the midpoint', async () => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, toCurrency: 'GBP', decisionTime: '2026-09-22T00:00:00.000Z' })
      .expect(200);

    expect(response.body).toMatchObject({
      buyRate: '0.780000',
      sellRate: '0.800000',
      bookingRate: '0.785000',
      convertedAmount: '7.85',
      rateOrigin: 'VIRTUAL_EXPLICIT',
    });
  });

  test('returns FX_RATE_UNAVAILABLE when neither explicit booking nor both quote sides are present', async () => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, toCurrency: 'AUD', decisionTime: '2026-09-22T00:00:00.000Z' })
      .expect(503);

    expect(response.body).toEqual({
      code: 'FX_RATE_UNAVAILABLE',
      requestAttemptId: 'attempt-001',
      message: 'Virtual BOOKING quote is incomplete for USD/AUD.',
    });
  });

  test('returns FX_RATE_UNAVAILABLE for an unknown pair', async () => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, toCurrency: 'XYZ', decisionTime: '2026-09-22T00:00:00.000Z' })
      .expect(503);

    expect(response.body.code).toBe('FX_RATE_UNAVAILABLE');
  });

  test('rejects invalid request shape without inventing a default currency or decision time', async () => {
    const response = await request(app).get('/api/fx/booking-rate').query({ fromCurrency: 'USD' }).expect(400);
    expect(response.body.code).toBe('INVALID_FX_REQUEST');
  });

  test('returns FX_RATE_STALE for a non-rolling fixture outside the request freshness policy', () => {
    const result = buildVirtualBookingQuote({
      quote: {
        buyRate: '0.91',
        sellRate: '0.93',
        approvalStatus: 'APPROVED',
        rateScale: 6,
        targetMinorUnits: 2,
        roundingMode: 'ROUND_HALF_UP',
        rateTimestamp: '2026-09-21T23:59:00.000Z',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveTo: '2027-01-01T00:00:00.000Z',
        rateSource: 'TEST',
        providerRateId: 'stale-rate',
        providerRateVersion: '1',
      },
      fromCurrency: 'USD',
      toCurrency: 'EUR',
      expectedTargetMinorUnits: 2,
      amount: '10.00',
      decisionTime: '2026-09-22T00:10:00.000Z',
      correlationId: 'corr-stale',
      requestAttemptId: 'attempt-stale',
      policyVersion: 'policy-1',
      maxStalenessSeconds: '300',
    });

    expect(result).toMatchObject({ error: 'FX_RATE_STALE' });
  });

  test.each([
    ['CAD', 'not Approved'],
    ['CHF', 'not Approved/Effective'],
  ])('returns FX_RATE_UNAVAILABLE when USD/%s quote is %s', async (toCurrency) => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, toCurrency, decisionTime: '2026-09-22T00:00:00.000Z' })
      .expect(503);

    expect(response.body.code).toBe('FX_RATE_UNAVAILABLE');
  });

  test('returns FX_RATE_UNAVAILABLE for an injected virtual timeout without inventing a quote', async () => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, toCurrency: 'NZD', decisionTime: '2026-09-22T00:00:00.000Z' })
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
        buyRate: '0.91',
        sellRate: '0.93',
        approvalStatus: 'APPROVED',
        rateTimestamp: '2026-09-21T23:59:00.000Z',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveTo: '2027-01-01T00:00:00.000Z',
        rateSource: 'TEST',
        providerRateId: 'rate-1',
        providerRateVersion: '1',
        rateScale: 6,
        targetMinorUnits: 2,
        roundingMode: 'ROUND_HALF_UP',
        ...fixtureOverride,
      },
      fromCurrency: 'USD',
      toCurrency: 'EUR',
      expectedTargetMinorUnits: 2,
      amount: '10',
      decisionTime: '2026-09-22T00:00:00.000Z',
      correlationId: 'corr-1',
      requestAttemptId: 'attempt-direct-1',
      policyVersion: 'policy-1',
      maxStalenessSeconds: '300',
    });
    expect(result.error).toBe('FX_RATE_UNAVAILABLE');
  });

  test('maps malformed amount to INVALID_FX_REQUEST instead of HTTP 500', async () => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, amount: 'NaN', decisionTime: '2026-09-22T00:00:00.000Z' })
      .expect(400);
    expect(response.body).toMatchObject({ code: 'INVALID_FX_REQUEST', requestAttemptId: 'attempt-001' });
  });

  test.each([
    ['configured USD amount with more than two decimals', { ...validQuery, amount: '10.001' }],
    ['non-USD source direction', { ...validQuery, fromCurrency: 'EUR' }],
  ])('rejects %s as INVALID_FX_REQUEST', async (_label, query) => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...query, decisionTime: '2026-09-22T00:00:00.000Z' })
      .expect(400);
    expect(response.body.code).toBe('INVALID_FX_REQUEST');
  });

  test.each([
    ['non-integer rateScale', { rateScale: '6' }],
    ['rateScale below minimum', { rateScale: 1 }],
    ['rateScale above maximum', { rateScale: 11 }],
    ['non-integer target minor units', { targetMinorUnits: '2' }],
    ['negative target minor units', { targetMinorUnits: -1 }],
    ['target minor units above rate scale', { targetMinorUnits: 7 }],
    ['unsupported rounding mode', { roundingMode: 'ROUND_DOWN' }],
  ])('fails closed for %s precision metadata', (_label, override) => {
    const result = buildVirtualBookingQuote({
      quote: {
        bookingRate: '0.920000',
        approvalStatus: 'APPROVED',
        rateScale: 6,
        targetMinorUnits: 2,
        roundingMode: 'ROUND_HALF_UP',
        rateTimestamp: '2026-09-21T23:59:00.000Z',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveTo: '2027-01-01T00:00:00.000Z',
        rateSource: 'TEST',
        providerRateId: 'rate-precision',
        providerRateVersion: '1',
        ...override,
      },
      fromCurrency: 'USD',
      toCurrency: 'EUR',
      expectedTargetMinorUnits: 2,
      amount: '10.00',
      decisionTime: '2026-09-22T00:00:00.000Z',
      correlationId: 'corr-precision',
      requestAttemptId: 'attempt-precision',
      policyVersion: 'policy-1',
      maxStalenessSeconds: '300',
    });
    expect(result.error).toBe('FX_RATE_UNAVAILABLE');
  });

  test('fails closed when a supplied BOOKING rate is not an exact decimal', () => {
    const result = buildVirtualBookingQuote({
      quote: {
        bookingRate: 'not-a-rate',
        approvalStatus: 'APPROVED',
        rateScale: 6,
        targetMinorUnits: 2,
        roundingMode: 'ROUND_HALF_UP',
        rateTimestamp: '2026-09-21T23:59:00.000Z',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveTo: '2027-01-01T00:00:00.000Z',
        rateSource: 'TEST',
        providerRateId: 'rate-invalid',
        providerRateVersion: '1',
      },
      fromCurrency: 'USD',
      toCurrency: 'EUR',
      expectedTargetMinorUnits: 2,
      amount: '10.00',
      decisionTime: '2026-09-22T00:00:00.000Z',
      correlationId: 'corr-rate',
      requestAttemptId: 'attempt-rate',
      policyVersion: 'policy-1',
      maxStalenessSeconds: '300',
    });
    expect(result.error).toBe('FX_RATE_UNAVAILABLE');
  });

  test.each([
    ['blank correlationId', { correlationId: ' ' }],
    ['blank requestAttemptId', { requestAttemptId: ' ' }],
    ['blank policyVersion', { policyVersion: '' }],
    ['non-integer max staleness', { maxStalenessSeconds: '1.5' }],
    ['non-positive max staleness', { maxStalenessSeconds: '0' }],
    ['blank target currency', { toCurrency: ' ' }],
  ])('fails closed for %s in the provider contract', (_label, override) => {
    const result = buildVirtualBookingQuote({
      quote: null,
      fromCurrency: 'USD',
      toCurrency: 'EUR',
      expectedTargetMinorUnits: 2,
      amount: '10.00',
      decisionTime: '2026-09-22T00:00:00.000Z',
      correlationId: 'corr-contract',
      requestAttemptId: 'attempt-contract',
      policyVersion: 'policy-1',
      maxStalenessSeconds: '300',
      ...override,
    });
    expect(result.error).toBe('INVALID_FX_REQUEST');
  });

  test('supports an explicit BOOKING-only quote with an open-ended effective interval', () => {
    const result = buildVirtualBookingQuote({
      quote: {
        bookingRate: '0.920000',
        approvalStatus: 'APPROVED',
        rateScale: 6,
        targetMinorUnits: 2,
        roundingMode: 'ROUND_HALF_UP',
        rateTimestamp: '2026-09-21T23:59:00.000Z',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveTo: null,
        rateSource: 'TEST',
        providerRateId: 'rate-open-ended',
        providerRateVersion: '1',
      },
      fromCurrency: 'USD',
      toCurrency: 'EUR',
      expectedTargetMinorUnits: 2,
      amount: '10',
      decisionTime: '2026-09-22T00:00:00.000Z',
      correlationId: 'corr-open-ended',
      requestAttemptId: 'attempt-open-ended',
      policyVersion: 'policy-1',
      maxStalenessSeconds: '300',
    });
    expect(result).toMatchObject({
      buyRate: undefined,
      sellRate: undefined,
      bookingRate: '0.920000',
      convertedAmount: '9.20',
      effectiveTo: null,
    });
  });

  test.each([
    ['EUR fixture claiming zero minor units', 'EUR', 0, 2],
    ['JPY fixture claiming two minor units', 'JPY', 2, 0],
  ])('fails closed for %s', (_label, toCurrency, targetMinorUnits, expectedTargetMinorUnits) => {
    const result = buildVirtualBookingQuote({
      quote: {
        bookingRate: '1.000000',
        approvalStatus: 'APPROVED',
        rateScale: 6,
        targetMinorUnits,
        roundingMode: 'ROUND_HALF_UP',
        rateTimestamp: '2026-09-21T23:59:00.000Z',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveTo: null,
        rateSource: 'TEST',
        providerRateId: 'rate-precision-mismatch',
        providerRateVersion: '1',
      },
      fromCurrency: 'USD',
      toCurrency,
      expectedTargetMinorUnits,
      amount: '10.00',
      decisionTime: '2026-09-22T00:00:00.000Z',
      correlationId: 'corr-precision-mismatch',
      requestAttemptId: 'attempt-precision-mismatch',
      policyVersion: 'policy-1',
      maxStalenessSeconds: '300',
    });
    expect(result.error).toBe('FX_RATE_UNAVAILABLE');
  });

  test('rejects a zero configured USD amount', async () => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, amount: '0.00', decisionTime: '2026-09-22T00:00:00.000Z' })
      .expect(400);
    expect(response.body.code).toBe('INVALID_FX_REQUEST');
  });

  test('accepts the Balance-configured maximum domain of 18 USD integer digits', async () => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, amount: '123456789012345678.99', decisionTime: '2026-09-22T00:00:00.000Z' })
      .expect(200);
    expect(response.body).toMatchObject({
      requestedAmount: '123456789012345678.99',
      convertedAmount: '113580245891358024.67',
    });
  });

  test.each([
    ['zero explicit BOOKING rate', { bookingRate: '0.000000' }],
    ['zero BUY side', { buyRate: '0.000000', sellRate: '1.000000' }],
    ['zero SELL side', { buyRate: '1.000000', sellRate: '0.000000' }],
    ['missing rate source', { bookingRate: '1.000000', rateSource: undefined }],
    ['blank provider rate id', { bookingRate: '1.000000', providerRateId: ' ' }],
    ['missing provider version', { bookingRate: '1.000000', providerRateVersion: undefined }],
  ])('fails closed for %s evidence', (_label, rateEvidence) => {
    const result = buildVirtualBookingQuote({
      quote: {
        approvalStatus: 'APPROVED',
        rateScale: 6,
        targetMinorUnits: 2,
        roundingMode: 'ROUND_HALF_UP',
        rateTimestamp: '2026-09-21T23:59:00.000Z',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveTo: null,
        rateSource: 'TEST',
        providerRateId: 'rate-evidence',
        providerRateVersion: '1',
        ...rateEvidence,
      },
      fromCurrency: 'USD',
      toCurrency: 'EUR',
      expectedTargetMinorUnits: 2,
      amount: '10.00',
      decisionTime: '2026-09-22T00:00:00.000Z',
      correlationId: 'corr-evidence',
      requestAttemptId: 'attempt-evidence',
      policyVersion: 'policy-1',
      maxStalenessSeconds: '300',
    });
    expect(result.error).toBe('FX_RATE_UNAVAILABLE');
  });

  test('rounds provider convertedAmount once to the target owner-currency precision', async () => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, amount: '1.00', toCurrency: 'JPY', decisionTime: '2026-09-22T00:00:00.000Z' })
      .expect(200);

    expect(response.body).toMatchObject({
      fromCurrency: 'USD',
      toCurrency: 'JPY',
      requestedAmount: '1.00',
      bookingRate: '150.500000',
      convertedAmount: '151',
    });
  });

  test('supports exact ROUND_HALF_UP at three owner-currency minor units', () => {
    expect(convertToOwnerCurrency('1.00', '1.234500', 3, 6)).toBe('1.235');
    expect(convertToOwnerCurrency('1.00', '1.234499', 3, 6)).toBe('1.234');
  });

  test('does not invert a legacy owner-to-USD fixture when the direct USD-to-owner pair is absent', async () => {
    const response = await request(app)
      .get('/api/fx/booking-rate')
      .query({ ...validQuery, toCurrency: 'SEK', decisionTime: '2026-09-22T00:00:00.000Z' })
      .expect(503);
    expect(response.body.code).toBe('FX_RATE_UNAVAILABLE');
  });
});
