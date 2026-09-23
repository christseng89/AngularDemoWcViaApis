import { createMakerExcessRuntime } from '../../../src/config/makerExcessRuntime';

const policyJson = JSON.stringify([
  {
    policyVersion: 'import-v1',
    ownerType: 'IMPORT_LC',
    allowancePercentage: '10',
    configuredMaximumUsd: '150000',
    fxMaxStalenessSeconds: 300,
    currencyPrecisions: { USD: 2, EUR: 2 },
    rateScale: 6,
    roundingMode: 'ROUND_HALF_UP',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    effectiveTo: null,
    fallbackPolicy: 'FAIL_CLOSED',
    pbdFallbackPolicy: {
      authorized: false,
      fallbackPolicyId: null,
      fallbackPolicyVersion: null,
      effectiveFrom: null,
      effectiveTo: null,
    },
  },
  {
    policyVersion: 'export-v1',
    ownerType: 'EXPORT_CONFIRMATION',
    allowancePercentage: '8',
    configuredMaximumUsd: '100000',
    fxMaxStalenessSeconds: 300,
    currencyPrecisions: { USD: 2, EUR: 2 },
    rateScale: 6,
    roundingMode: 'ROUND_HALF_UP',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    effectiveTo: null,
    fallbackPolicy: 'FAIL_CLOSED',
    pbdFallbackPolicy: {
      authorized: false,
      fallbackPolicyId: null,
      fallbackPolicyVersion: null,
      effectiveFrom: null,
      effectiveTo: null,
    },
  },
]);

describe('createMakerExcessRuntime', () => {
  test('loads policy and calls the non-production Virtual BOOKING endpoint', async () => {
    const fetchImpl = jest.fn(async (url: string) => {
      const requestUrl = new URL(url);
      const requestAttemptId = requestUrl.searchParams.get('requestAttemptId')!;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            fromCurrency: 'USD',
            toCurrency: 'EUR',
            requestedAmount: '150000',
            ratePurpose: 'BOOKING',
            bookingRate: '0.9',
            convertedAmount: '135000',
            rateOrigin: 'DERIVED_MID',
            rateSource: 'VIRTUAL_CURRENCY_EXCHANGE',
            providerRateId: 'virtual-eur',
            providerRateVersion: '1',
            rateTimestamp: '2026-09-23T09:59:00.000Z',
            approvalStatus: 'APPROVED',
            effectiveFrom: '2026-09-23T09:00:00.000Z',
            effectiveTo: null,
            correlationId: 'movement-1',
            policyVersion: 'import-v1',
            requestAttemptId,
          };
        },
      };
    });
    const runtime = createMakerExcessRuntime({
      env: {
        APP_ENV: 'development',
        CURRENCY_EXCHANGE_ADAPTER: 'VIRTUAL',
        CURRENCY_EXCHANGE_ENDPOINT: 'http://localhost:3001/api/fx/booking-rate',
        CURRENCY_EXCHANGE_TIMEOUT_MS: '1000',
      },
      policyJson,
      fetchImpl,
    });

    expect(runtime.policy.resolve('IMPORT_LC', '2026-09-23T10:00:00.000Z').policyVersion).toBe('import-v1');
    await expect(
      runtime.fx.resolveConfiguredMaximum({
        request: {
          fromCurrency: 'USD',
          toCurrency: 'EUR',
          amount: '150000',
          ratePurpose: 'BOOKING',
          decisionTime: '2026-09-23T10:00:00.000Z',
          correlationId: 'movement-1',
          policyVersion: 'import-v1',
        },
        commandIdempotencyKey: 'maker-command-1',
        maxStalenessSeconds: 300,
        pbdAuthorization: { authorized: false },
      }),
    ).resolves.toMatchObject({ ok: true, quote: { rateOrigin: 'DERIVED_MID', bookingRate: '0.9' } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('rejects the Virtual adapter in production', () => {
    expect(() =>
      createMakerExcessRuntime({
        env: {
          APP_ENV: 'production',
          CURRENCY_EXCHANGE_ADAPTER: 'VIRTUAL',
          CURRENCY_EXCHANGE_ENDPOINT: 'http://localhost:3001/api/fx/booking-rate',
          CURRENCY_EXCHANGE_TIMEOUT_MS: '1000',
        },
        policyJson,
      }),
    ).toThrow(/VIRTUAL.*production/i);
  });

  test('fails closed when PROVIDER is selected without a provider adapter', () => {
    expect(() =>
      createMakerExcessRuntime({
        env: {
          APP_ENV: 'production',
          CURRENCY_EXCHANGE_ADAPTER: 'PROVIDER',
          CURRENCY_EXCHANGE_TIMEOUT_MS: '1000',
        },
        policyJson,
      }),
    ).toThrow(/provider adapter/i);
  });

  test.each(['0', '-1', '1.5', 'not-a-number'])('rejects invalid Currency Exchange timeout %s', (timeout) => {
    expect(() =>
      createMakerExcessRuntime({
        env: {
          APP_ENV: 'development',
          CURRENCY_EXCHANGE_ADAPTER: 'VIRTUAL',
          CURRENCY_EXCHANGE_ENDPOINT: 'http://localhost:3001/api/fx/booking-rate',
          CURRENCY_EXCHANGE_TIMEOUT_MS: timeout,
        },
        policyJson,
      }),
    ).toThrow(/timeout/i);
  });
});
