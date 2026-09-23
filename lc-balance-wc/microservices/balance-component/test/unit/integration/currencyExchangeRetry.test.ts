import {
  createCurrencyExchangeLookupSession,
  createVirtualCurrencyExchangeAdapter,
  type CurrencyExchangeAttemptContext,
  type CurrencyExchangePort,
  type CurrencyExchangeProviderQuote,
  type CurrencyExchangeQuote,
  type CurrencyExchangeLookupSessionOptions,
  type CurrencyExchangeRequest,
} from '../../../src/integration/currencyExchange';

const request: CurrencyExchangeRequest = {
  fromCurrency: 'USD',
  toCurrency: 'EUR',
  amount: '100.00',
  ratePurpose: 'BOOKING',
  decisionTime: '2026-09-22T00:00:00.000Z',
  correlationId: 'corr-retry-1',
  policyVersion: 'policy-v1',
};

const quote: CurrencyExchangeQuote = {
  fromCurrency: 'USD',
  toCurrency: 'EUR',
  requestedAmount: '100.00',
  ratePurpose: 'BOOKING',
  bookingRate: '0.920000',
  convertedAmount: '92.00',
  rateOrigin: 'PROVIDER_SUPPLIED',
  rateSource: 'PROVIDER',
  providerRateId: 'rate-1',
  providerRateVersion: '2',
  rateTimestamp: '2026-09-21T23:59:00.000Z',
  approvalStatus: 'APPROVED',
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  effectiveTo: '2027-01-01T00:00:00.000Z',
  correlationId: request.correlationId,
  policyVersion: request.policyVersion,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function echoAttempt(result: Promise<CurrencyExchangeQuote>, context: CurrencyExchangeAttemptContext): Promise<CurrencyExchangeProviderQuote> {
  return result.then((providerQuote) => ({ ...providerQuote, requestAttemptId: context.requestAttemptId }));
}

describe('Currency Exchange timeout, retry and out-of-order safety', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('timeout aborts the active attempt and maps to FX_RATE_UNAVAILABLE without a pending state', async () => {
    jest.useFakeTimers();
    const late = deferred<CurrencyExchangeQuote>();
    const port: CurrencyExchangePort = {
      getBookingRate: jest.fn((_request, context) => echoAttempt(late.promise, context!)),
    };
    const session = createCurrencyExchangeLookupSession({
      request,
      commandIdempotencyKey: 'cmd-1',
      maxStalenessSeconds: 300,
      environment: 'PRODUCTION',
    });

    const resultPromise = session.lookup(port, 50);
    await jest.advanceTimersByTimeAsync(50);
    await expect(resultPromise).resolves.toEqual({ ok: false, code: 'FX_RATE_UNAVAILABLE' });
    const context = (port.getBookingRate as jest.Mock).mock.calls[0]![1];
    expect(context.signal.aborted).toBe(true);

    late.resolve(quote);
    await Promise.resolve();
    expect(session.activeAttemptNumber()).toBe(1);
  });

  test('explicit retry reuses the exact request, correlation and command idempotency identity', async () => {
    jest.useFakeTimers();
    const first = deferred<CurrencyExchangeQuote>();
    const getBookingRate = jest
      .fn()
      .mockImplementationOnce((_request, context) => echoAttempt(first.promise, context))
      .mockImplementationOnce((_request, context) => echoAttempt(Promise.resolve(quote), context));
    const session = createCurrencyExchangeLookupSession({
      request,
      commandIdempotencyKey: 'cmd-retry-same',
      maxStalenessSeconds: 300,
      environment: 'PRODUCTION',
    });

    const timedOut = session.lookup({ getBookingRate }, 25);
    await jest.advanceTimersByTimeAsync(25);
    await expect(timedOut).resolves.toEqual({ ok: false, code: 'FX_RATE_UNAVAILABLE' });
    await expect(session.lookup({ getBookingRate }, 25)).resolves.toMatchObject({ ok: true, quote });

    expect(getBookingRate).toHaveBeenCalledTimes(2);
    expect(getBookingRate.mock.calls[0]![0]).toBe(getBookingRate.mock.calls[1]![0]);
    expect(getBookingRate.mock.calls.map((call) => call[0].correlationId)).toEqual(['corr-retry-1', 'corr-retry-1']);
    expect(getBookingRate.mock.calls.map((call) => call[1].commandIdempotencyKey)).toEqual(['cmd-retry-same', 'cmd-retry-same']);
    first.resolve({ ...quote, providerRateVersion: '1' });
  });

  test('generates a distinct attempt ID per provider call and accepts only the exact provider echo', async () => {
    const getBookingRate = jest.fn((_request, context) =>
      Promise.resolve({ ...quote, requestAttemptId: context.requestAttemptId, providerRateVersion: 'opaque-vNext' }),
    );
    const session = createCurrencyExchangeLookupSession({
      request,
      commandIdempotencyKey: 'cmd-attempt-echo',
      maxStalenessSeconds: 300,
      environment: 'PRODUCTION',
    });

    await expect(session.lookup({ getBookingRate }, 1000)).resolves.toMatchObject({ ok: true });
    await expect(session.lookup({ getBookingRate }, 1000)).resolves.toMatchObject({
      ok: true,
      quote: { providerRateVersion: 'opaque-vNext' },
    });
    const contexts = getBookingRate.mock.calls.map((call) => call[1]);
    expect(contexts[0].requestAttemptId).toEqual(expect.any(String));
    expect(contexts[0].requestAttemptId).not.toBe('');
    expect(contexts[1].requestAttemptId).not.toBe(contexts[0].requestAttemptId);
    expect(contexts.map((context) => context.commandIdempotencyKey)).toEqual(['cmd-attempt-echo', 'cmd-attempt-echo']);
  });

  test('rejects a response echoing a non-active attempt ID regardless of provider version text', async () => {
    const getBookingRate = jest.fn().mockResolvedValue({
      ...quote,
      requestAttemptId: 'old-attempt-id',
      providerRateVersion: '999999-newest-looking',
    });
    const session = createCurrencyExchangeLookupSession({
      request,
      commandIdempotencyKey: 'cmd-attempt-mismatch',
      maxStalenessSeconds: 300,
      environment: 'PRODUCTION',
    });

    await expect(session.lookup({ getBookingRate }, 1000)).resolves.toEqual({ ok: false, code: 'FX_RATE_UNAVAILABLE' });
  });

  test('a newer attempt wins even when its opaque provider version looks older', async () => {
    const oldAttempt = deferred<CurrencyExchangeQuote>();
    const getBookingRate = jest
      .fn()
      .mockImplementationOnce((_request, context) => echoAttempt(oldAttempt.promise, context))
      .mockImplementationOnce((_request, context) => echoAttempt(Promise.resolve({ ...quote, providerRateVersion: 'aaa-active' }), context));
    const session = createCurrencyExchangeLookupSession({
      request,
      commandIdempotencyKey: 'cmd-out-of-order',
      maxStalenessSeconds: 300,
      environment: 'PRODUCTION',
    });

    const firstResult = session.lookup({ getBookingRate }, 1000);
    await expect(session.lookup({ getBookingRate }, 1000)).resolves.toMatchObject({
      ok: true,
      quote: { providerRateVersion: 'aaa-active' },
    });
    oldAttempt.resolve({ ...quote, providerRateVersion: 'zzz-late' });
    await expect(firstResult).resolves.toEqual({ ok: false, code: 'FX_RATE_UNAVAILABLE' });
  });

  test('a newer failed retry remains authoritative when an older valid response arrives late', async () => {
    const oldAttempt = deferred<CurrencyExchangeQuote>();
    const getBookingRate = jest
      .fn()
      .mockImplementationOnce((_request, context) => echoAttempt(oldAttempt.promise, context))
      .mockRejectedValueOnce(new Error('transport failure'));
    const session = createCurrencyExchangeLookupSession({
      request,
      commandIdempotencyKey: 'cmd-newer-failure',
      maxStalenessSeconds: 300,
      environment: 'PRODUCTION',
    });

    const oldResult = session.lookup({ getBookingRate }, 1000);
    await expect(session.lookup({ getBookingRate }, 1000)).resolves.toEqual({ ok: false, code: 'FX_RATE_UNAVAILABLE' });
    oldAttempt.resolve(quote);
    await expect(oldResult).resolves.toEqual({ ok: false, code: 'FX_RATE_UNAVAILABLE' });
  });

  test.each([
    ['transport failure', () => Promise.reject(new Error('network down')), 'FX_RATE_UNAVAILABLE'],
    ['not Approved', () => Promise.resolve({ ...quote, approvalStatus: 'PENDING' as const }), 'FX_RATE_UNAVAILABLE'],
    ['not Effective', () => Promise.resolve({ ...quote, effectiveFrom: '2026-10-01T00:00:00.000Z' }), 'FX_RATE_UNAVAILABLE'],
    ['stale', () => Promise.resolve({ ...quote, rateTimestamp: '2026-09-21T23:00:00.000Z' }), 'FX_RATE_STALE'],
    ['wrong correlation', () => Promise.resolve({ ...quote, correlationId: 'old-correlation' }), 'FX_RATE_UNAVAILABLE'],
    ['wrong pair', () => Promise.resolve({ ...quote, toCurrency: 'GBP' }), 'FX_RATE_UNAVAILABLE'],
    ['wrong purpose', () => Promise.resolve({ ...quote, ratePurpose: 'SELL' as never }), 'FX_RATE_UNAVAILABLE'],
  ])('maps %s and never exposes FX_RATE_PENDING', async (_label, providerResult, expectedCode) => {
    const session = createCurrencyExchangeLookupSession({
      request,
      commandIdempotencyKey: 'cmd-mapping',
      maxStalenessSeconds: 300,
      environment: 'PRODUCTION',
    });
    const getBookingRate = jest.fn((_request, context) =>
      providerResult().then((providerQuote) => ({ ...providerQuote, requestAttemptId: context.requestAttemptId })),
    );
    await expect(session.lookup({ getBookingRate }, 1000)).resolves.toEqual({
      ok: false,
      code: expectedCode,
    });
  });

  test('virtual adapter forwards the stable command identity and abort signal without changing the request correlation', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...quote, requestAttemptId: 'attempt-header-1' }),
    });
    const adapter = createVirtualCurrencyExchangeAdapter({
      config: { environment: 'NON_PRODUCTION', adapter: 'VIRTUAL' },
      endpoint: 'http://lc-payment.test/api/fx/booking-rate',
      maxStalenessSeconds: 300,
      fetchImpl,
    });
    const controller = new AbortController();

    await adapter.getBookingRate(request, {
      signal: controller.signal,
      commandIdempotencyKey: 'cmd-header-1',
      requestAttemptId: 'attempt-header-1',
    });
    const [rawUrl, init] = fetchImpl.mock.calls[0]!;
    expect(new URL(rawUrl).searchParams.get('correlationId')).toBe(request.correlationId);
    expect(new URL(rawUrl).searchParams.get('requestAttemptId')).toBe('attempt-header-1');
    expect(init).toEqual({
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json', 'X-Command-Idempotency-Key': 'cmd-header-1' },
    });
  });

  test('maps a safely typed virtual HTTP stale response to FX_RATE_STALE through the real adapter path', async () => {
    const fetchImpl = jest.fn((rawUrl: string) =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: async () => ({
          code: 'FX_RATE_STALE',
          requestAttemptId: new URL(rawUrl).searchParams.get('requestAttemptId'),
          message: 'Virtual BOOKING quote is stale.',
        }),
      }),
    );
    const adapter = createVirtualCurrencyExchangeAdapter({
      config: { environment: 'NON_PRODUCTION', adapter: 'VIRTUAL' },
      endpoint: 'http://lc-payment.test/api/fx/booking-rate',
      maxStalenessSeconds: 300,
      fetchImpl,
    });
    const session = createCurrencyExchangeLookupSession({
      request,
      commandIdempotencyKey: 'cmd-http-stale',
      maxStalenessSeconds: 300,
      environment: 'NON_PRODUCTION',
    });

    await expect(session.lookup(adapter, 1000)).resolves.toEqual({ ok: false, code: 'FX_RATE_STALE' });
  });

  test('maps a typed stale response with a mismatched attempt echo to FX_RATE_UNAVAILABLE', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ code: 'FX_RATE_STALE', requestAttemptId: 'old-attempt-id' }),
    });
    const adapter = createVirtualCurrencyExchangeAdapter({
      config: { environment: 'NON_PRODUCTION', adapter: 'VIRTUAL' },
      endpoint: 'http://lc-payment.test/api/fx/booking-rate',
      maxStalenessSeconds: 300,
      fetchImpl,
    });
    const session = createCurrencyExchangeLookupSession({
      request,
      commandIdempotencyKey: 'cmd-http-stale-mismatch',
      maxStalenessSeconds: 300,
      environment: 'NON_PRODUCTION',
    });

    await expect(session.lookup(adapter, 1000)).resolves.toEqual({ ok: false, code: 'FX_RATE_UNAVAILABLE' });
  });

  test('snapshots production environment and freshness inputs before an in-flight caller mutation', async () => {
    const pending = deferred<CurrencyExchangeQuote>();
    const options: CurrencyExchangeLookupSessionOptions = {
      request,
      commandIdempotencyKey: 'cmd-immutable-boundary',
      maxStalenessSeconds: 300,
      environment: 'PRODUCTION',
    };
    const session = createCurrencyExchangeLookupSession(options);
    const result = session.lookup({ getBookingRate: jest.fn((_request, context) => echoAttempt(pending.promise, context!)) }, 1000);

    options.environment = 'NON_PRODUCTION';
    options.maxStalenessSeconds = 9999;
    pending.resolve({ ...quote, rateOrigin: 'DERIVED_MID', rateTimestamp: '2026-09-21T23:00:00.000Z' });
    await expect(result).resolves.toEqual({ ok: false, code: 'FX_RATE_UNAVAILABLE' });
  });

  test('snapshots PBD authorization before an in-flight caller mutation', async () => {
    const pending = deferred<CurrencyExchangeQuote>();
    const options: CurrencyExchangeLookupSessionOptions = {
      request,
      commandIdempotencyKey: 'cmd-immutable-pbd',
      maxStalenessSeconds: 300,
      environment: 'PRODUCTION',
      pbdAuthorization: { authorized: false },
    };
    const session = createCurrencyExchangeLookupSession(options);
    const result = session.lookup({ getBookingRate: jest.fn((_request, context) => echoAttempt(pending.promise, context!)) }, 1000);
    const authorization = options.pbdAuthorization as {
      authorized: boolean;
      fallbackPolicyId?: string;
      fallbackPolicyVersion?: string;
    };

    authorization.authorized = true;
    authorization.fallbackPolicyId = 'injected-policy';
    authorization.fallbackPolicyVersion = 'injected-version';
    pending.resolve({ ...quote, fallbackReason: 'PREVIOUS_BUSINESS_DAY', rateDate: '2026-09-21' });
    await expect(result).resolves.toEqual({ ok: false, code: 'FX_RATE_UNAVAILABLE' });
  });

  test('uses USD_PAR without calling the provider', async () => {
    const getBookingRate = jest.fn();
    const usdRequest = { ...request, toCurrency: 'USD', amount: '100.00' } as const;
    const session = createCurrencyExchangeLookupSession({
      request: usdRequest,
      commandIdempotencyKey: 'cmd-usd-par',
      maxStalenessSeconds: 300,
      environment: 'PRODUCTION',
    });

    await expect(session.lookup({ getBookingRate }, 1000)).resolves.toMatchObject({
      ok: true,
      quote: { rateOrigin: 'USD_PAR', bookingRate: '1', convertedAmount: '100.00' },
    });
    expect(getBookingRate).not.toHaveBeenCalled();
  });

  test.each([
    ['blank command identity', { commandIdempotencyKey: '' }, 100],
    ['zero timeout', { commandIdempotencyKey: 'cmd-1' }, 0],
    ['fractional timeout', { commandIdempotencyKey: 'cmd-1' }, 1.5],
  ])('rejects invalid retry contract: %s', async (_label, override, timeoutMs) => {
    const sessionFactory = () =>
      createCurrencyExchangeLookupSession({
        request,
        commandIdempotencyKey: override.commandIdempotencyKey,
        maxStalenessSeconds: 300,
        environment: 'PRODUCTION',
      });
    if (override.commandIdempotencyKey === '') {
      expect(sessionFactory).toThrow(/idempotency/i);
    } else {
      await expect(sessionFactory().lookup({ getBookingRate: jest.fn() }, timeoutMs)).rejects.toThrow(/timeout/i);
    }
  });
});
