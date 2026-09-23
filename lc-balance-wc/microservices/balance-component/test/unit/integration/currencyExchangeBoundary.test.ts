import {
  createVirtualCurrencyExchangeAdapter,
  evaluateCurrencyExchangeQuote,
  resolveConfiguredMaximumQuote,
  type CurrencyExchangeQuote,
  type CurrencyExchangeRequest,
  type CurrencyExchangeAttemptContext,
} from '../../../src/integration/currencyExchange';

const request: CurrencyExchangeRequest = {
  fromCurrency: 'USD',
  toCurrency: 'EUR',
  amount: '100.00',
  ratePurpose: 'BOOKING',
  decisionTime: '2026-09-22T00:00:00.000Z',
  correlationId: 'corr-boundary-1',
  policyVersion: 'excess-policy-v1',
};

const providerQuote: CurrencyExchangeQuote = {
  fromCurrency: 'USD',
  toCurrency: 'EUR',
  requestedAmount: '100.00',
  ratePurpose: 'BOOKING',
  bookingRate: '0.920000',
  convertedAmount: '92.00',
  rateOrigin: 'PROVIDER_SUPPLIED',
  rateSource: 'PROVIDER_FX',
  providerRateId: 'provider-rate-1',
  providerRateVersion: '1',
  rateTimestamp: '2026-09-21T23:59:00.000Z',
  approvalStatus: 'APPROVED',
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  effectiveTo: '2027-01-01T00:00:00.000Z',
  correlationId: request.correlationId,
  policyVersion: request.policyVersion,
  requestAttemptId: 'attempt-boundary-1',
};

const attemptContext = {
  signal: new AbortController().signal,
  commandIdempotencyKey: 'cmd-boundary-1',
  requestAttemptId: 'attempt-boundary-1',
};

describe('Currency Exchange adapter and production PBD boundary', () => {
  test('non-production Balance virtual adapter calls the direct USD-to-owner endpoint with exact decision evidence', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => providerQuote });
    const adapter = createVirtualCurrencyExchangeAdapter({
      config: { environment: 'NON_PRODUCTION', adapter: 'VIRTUAL' },
      endpoint: 'http://lc-payment.test/api/fx/booking-rate',
      maxStalenessSeconds: 300,
      fetchImpl,
    });

    await expect(adapter.getBookingRate(request, attemptContext)).resolves.toEqual(providerQuote);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [rawUrl, init] = fetchImpl.mock.calls[0]!;
    const url = new URL(rawUrl);
    expect(url.origin + url.pathname).toBe('http://lc-payment.test/api/fx/booking-rate');
    expect(Object.fromEntries(url.searchParams.entries())).toEqual({
      fromCurrency: 'USD',
      toCurrency: 'EUR',
      amount: '100.00',
      decisionTime: request.decisionTime,
      correlationId: request.correlationId,
      policyVersion: request.policyVersion,
      requestAttemptId: attemptContext.requestAttemptId,
      maxStalenessSeconds: '300',
    });
    expect(init).toEqual({
      method: 'GET',
      signal: attemptContext.signal,
      headers: { Accept: 'application/json', 'X-Command-Idempotency-Key': attemptContext.commandIdempotencyKey },
    });
  });

  test.each([
    ['production config', { environment: 'PRODUCTION', adapter: 'PROVIDER' }],
    ['non-virtual config', { environment: 'NON_PRODUCTION', adapter: 'PROVIDER' }],
  ] as const)('refuses to construct the virtual adapter with %s', (_label, config) => {
    expect(() =>
      createVirtualCurrencyExchangeAdapter({
        config,
        endpoint: 'http://lc-payment.test/api/fx/booking-rate',
        maxStalenessSeconds: 300,
        fetchImpl: jest.fn(),
      }),
    ).toThrow(/virtual.*non-production/i);
  });

  test('preserves a safely typed unavailable code from a non-success virtual response', async () => {
    const adapter = createVirtualCurrencyExchangeAdapter({
      config: { environment: 'NON_PRODUCTION', adapter: 'VIRTUAL' },
      endpoint: 'http://lc-payment.test/api/fx/booking-rate',
      maxStalenessSeconds: 300,
      fetchImpl: jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ code: 'FX_RATE_UNAVAILABLE', requestAttemptId: attemptContext.requestAttemptId }),
      }),
    });
    await expect(adapter.getBookingRate(request, attemptContext)).rejects.toThrow(/FX_RATE_UNAVAILABLE/);
  });

  test('fails closed when a non-success virtual response body is not readable JSON', async () => {
    const adapter = createVirtualCurrencyExchangeAdapter({
      config: { environment: 'NON_PRODUCTION', adapter: 'VIRTUAL' },
      endpoint: 'http://lc-payment.test/api/fx/booking-rate',
      maxStalenessSeconds: 300,
      fetchImpl: jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => Promise.reject(new Error('invalid JSON')),
      }),
    });
    await expect(adapter.getBookingRate(request, attemptContext)).rejects.toThrow(/HTTP 503/);
  });

  test('rejects a successful virtual response echoing a non-active attempt ID', async () => {
    const adapter = createVirtualCurrencyExchangeAdapter({
      config: { environment: 'NON_PRODUCTION', adapter: 'VIRTUAL' },
      endpoint: 'http://lc-payment.test/api/fx/booking-rate',
      maxStalenessSeconds: 300,
      fetchImpl: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ...providerQuote, requestAttemptId: 'old-attempt-id' }),
      }),
    });
    await expect(adapter.getBookingRate(request, attemptContext)).rejects.toThrow(/non-active request attempt/i);
  });

  test.each([
    ['zero max staleness', { endpoint: 'http://lc-payment.test/api/fx/booking-rate', maxStalenessSeconds: 0 }],
    ['fractional max staleness', { endpoint: 'http://lc-payment.test/api/fx/booking-rate', maxStalenessSeconds: 1.5 }],
    ['relative endpoint', { endpoint: '/api/fx/booking-rate', maxStalenessSeconds: 300 }],
    ['non-HTTP endpoint', { endpoint: 'file:///tmp/fx.json', maxStalenessSeconds: 300 }],
  ])('rejects virtual adapter configuration with %s', (_label, invalid) => {
    expect(() =>
      createVirtualCurrencyExchangeAdapter({
        config: { environment: 'NON_PRODUCTION', adapter: 'VIRTUAL' },
        ...invalid,
        fetchImpl: jest.fn(),
      }),
    ).toThrow();
  });

  test.each([null, 'not-an-object', [], {}, { fromCurrency: 'USD' }, { ...providerQuote, ratePurpose: 'SELL' }])(
    'rejects malformed successful virtual payload %p',
    async (payload) => {
      const adapter = createVirtualCurrencyExchangeAdapter({
        config: { environment: 'NON_PRODUCTION', adapter: 'VIRTUAL' },
        endpoint: 'http://lc-payment.test/api/fx/booking-rate',
        maxStalenessSeconds: 300,
        fetchImpl: jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload }),
      });
      await expect(adapter.getBookingRate(request, attemptContext)).rejects.toThrow(/malformed/);
    },
  );

  test('accepts an authorized provider-supplied PBD BOOKING quote and appends immutable policy evidence', () => {
    const pbdQuote: CurrencyExchangeQuote = {
      ...providerQuote,
      rateTimestamp: '2026-09-19T23:59:00.000Z',
      fallbackReason: 'PREVIOUS_BUSINESS_DAY',
      rateDate: '2026-09-19',
    };
    expect(
      evaluateCurrencyExchangeQuote(request, pbdQuote, 172900, 'PRODUCTION', {
        authorized: true,
        fallbackPolicyId: 'PBD-BOOKING-IMPORT',
        fallbackPolicyVersion: '2026-09-v1',
      }),
    ).toEqual({
      ok: true,
      quote: {
        ...pbdQuote,
        fallbackPolicyId: 'PBD-BOOKING-IMPORT',
        fallbackPolicyVersion: '2026-09-v1',
      },
    });
  });

  test.each([
    ['unauthorized', {}, { authorized: false }],
    ['virtual origin', { rateOrigin: 'VIRTUAL_EXPLICIT' }, { authorized: true, fallbackPolicyId: 'PBD-1', fallbackPolicyVersion: 'v1' }],
    ['derived origin', { rateOrigin: 'DERIVED_MID' }, { authorized: true, fallbackPolicyId: 'PBD-1', fallbackPolicyVersion: 'v1' }],
    ['not Approved', { approvalStatus: 'PENDING' }, { authorized: true, fallbackPolicyId: 'PBD-1', fallbackPolicyVersion: 'v1' }],
    ['not Effective', { effectiveFrom: '2026-10-01T00:00:00.000Z' }, { authorized: true, fallbackPolicyId: 'PBD-1', fallbackPolicyVersion: 'v1' }],
    ['missing reason', { fallbackReason: undefined }, { authorized: true, fallbackPolicyId: 'PBD-1', fallbackPolicyVersion: 'v1' }],
    ['wrong reason', { fallbackReason: 'BUY_SELL_MIDPOINT' }, { authorized: true, fallbackPolicyId: 'PBD-1', fallbackPolicyVersion: 'v1' }],
    ['missing rate date', { rateDate: undefined }, { authorized: true, fallbackPolicyId: 'PBD-1', fallbackPolicyVersion: 'v1' }],
    ['invalid rate date', { rateDate: '19-09-2026' }, { authorized: true, fallbackPolicyId: 'PBD-1', fallbackPolicyVersion: 'v1' }],
    ['same-day rate date', { rateDate: '2026-09-22' }, { authorized: true, fallbackPolicyId: 'PBD-1', fallbackPolicyVersion: 'v1' }],
    ['future rate date', { rateDate: '2099-01-01' }, { authorized: true, fallbackPolicyId: 'PBD-1', fallbackPolicyVersion: 'v1' }],
    ['rate date unrelated to timestamp', { rateDate: '2026-09-18' }, { authorized: true, fallbackPolicyId: 'PBD-1', fallbackPolicyVersion: 'v1' }],
    ['blank policy id', {}, { authorized: true, fallbackPolicyId: ' ', fallbackPolicyVersion: 'v1' }],
    ['blank policy version', {}, { authorized: true, fallbackPolicyId: 'PBD-1', fallbackPolicyVersion: '' }],
    [
      'provider-spoofed policy identity',
      { fallbackPolicyId: 'provider-id', fallbackPolicyVersion: 'provider-version' },
      { authorized: true, fallbackPolicyId: 'PBD-1', fallbackPolicyVersion: 'v1' },
    ],
  ] as const)('rejects %s PBD evidence', (_label, override, authorization) => {
    const pbdQuote = {
      ...providerQuote,
      rateTimestamp: '2026-09-19T23:59:00.000Z',
      fallbackReason: 'PREVIOUS_BUSINESS_DAY',
      rateDate: '2026-09-19',
      ...override,
    } as CurrencyExchangeQuote;
    expect(evaluateCurrencyExchangeQuote(request, pbdQuote, 172900, 'PRODUCTION', authorization)).toEqual({
      ok: false,
      code: 'FX_RATE_UNAVAILABLE',
    });
  });

  test('maps an authorized but stale PBD quote to FX_RATE_STALE', () => {
    const pbdQuote: CurrencyExchangeQuote = {
      ...providerQuote,
      rateTimestamp: '2026-09-19T23:59:00.000Z',
      fallbackReason: 'PREVIOUS_BUSINESS_DAY',
      rateDate: '2026-09-19',
    };
    expect(
      evaluateCurrencyExchangeQuote(request, pbdQuote, 300, 'PRODUCTION', {
        authorized: true,
        fallbackPolicyId: 'PBD-1',
        fallbackPolicyVersion: 'v1',
      }),
    ).toEqual({ ok: false, code: 'FX_RATE_STALE' });
  });

  test('resolver forwards effective PBD authorization and returns the policy-bound audit snapshot', async () => {
    const pbdQuote: CurrencyExchangeQuote = {
      ...providerQuote,
      rateTimestamp: '2026-09-19T23:59:00.000Z',
      fallbackReason: 'PREVIOUS_BUSINESS_DAY',
      rateDate: '2026-09-19',
    };
    const port = {
      getBookingRate: jest.fn((_request: CurrencyExchangeRequest, context: CurrencyExchangeAttemptContext) =>
        Promise.resolve({ ...pbdQuote, requestAttemptId: context.requestAttemptId }),
      ),
    };
    await expect(
      resolveConfiguredMaximumQuote(request, port, {
        maxStalenessSeconds: 172900,
        environment: 'PRODUCTION',
        commandIdempotencyKey: 'cmd-pbd-resolver',
        timeoutMs: 1000,
        pbdAuthorization: {
          authorized: true,
          fallbackPolicyId: 'PBD-BOOKING-IMPORT',
          fallbackPolicyVersion: '2026-09-v1',
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      quote: {
        fallbackReason: 'PREVIOUS_BUSINESS_DAY',
        rateDate: '2026-09-19',
        rateSource: 'PROVIDER_FX',
        fallbackPolicyId: 'PBD-BOOKING-IMPORT',
        fallbackPolicyVersion: '2026-09-v1',
      },
    });
  });

  test('authorization does not relabel an ordinary current provider quote as PBD', () => {
    expect(
      evaluateCurrencyExchangeQuote(request, providerQuote, 300, 'PRODUCTION', {
        authorized: true,
        fallbackPolicyId: 'PBD-1',
        fallbackPolicyVersion: 'v1',
      }),
    ).toEqual({ ok: true, quote: providerQuote });
  });

  test('production does not derive BOOKING when only provider BUY and SELL are present', () => {
    const noBooking = { ...providerQuote, bookingRate: undefined, buyRate: '0.91', sellRate: '0.93' } as unknown as CurrencyExchangeQuote;
    expect(evaluateCurrencyExchangeQuote(request, noBooking, 300, 'PRODUCTION')).toEqual({ ok: false, code: 'FX_RATE_UNAVAILABLE' });
  });
});
