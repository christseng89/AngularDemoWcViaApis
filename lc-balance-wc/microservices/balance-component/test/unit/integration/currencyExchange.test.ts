import {
  createCurrencyExchangeAdapterConfig,
  evaluateCurrencyExchangeQuote,
  usdParDecision,
  type CurrencyExchangeQuote,
  type CurrencyExchangeRequest,
} from '../../../src/integration/currencyExchange';

const request: CurrencyExchangeRequest = {
  baseCurrency: 'EUR',
  quoteCurrency: 'USD',
  amount: '10',
  ratePurpose: 'BOOKING',
  decisionTime: '2026-09-22T00:00:00.000Z',
  correlationId: 'corr-1',
  policyVersion: 'policy-1',
};

const quote: CurrencyExchangeQuote = {
  baseCurrency: 'EUR',
  quoteCurrency: 'USD',
  ratePurpose: 'BOOKING',
  bookingRate: '1.09',
  convertedAmount: '10.90',
  rateOrigin: 'PROVIDER_SUPPLIED',
  rateSource: 'PROVIDER',
  providerRateId: 'rate-1',
  providerRateVersion: 'version-1',
  rateTimestamp: '2026-09-21T23:59:00.000Z',
  approvalStatus: 'APPROVED',
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  effectiveTo: '2027-01-01T00:00:00.000Z',
  correlationId: 'corr-1',
  policyVersion: 'policy-1',
};

describe('Currency Exchange BOOKING contract', () => {
  test('accepts a matching provider-supplied Approved, Effective and Fresh BOOKING quote', () => {
    expect(evaluateCurrencyExchangeQuote(request, quote, 300, 'PRODUCTION')).toEqual({ ok: true, quote });
  });

  test('accepts an open-ended effective interval', () => {
    const openEnded = { ...quote, effectiveTo: null };
    expect(evaluateCurrencyExchangeQuote(request, openEnded, 300, 'PRODUCTION')).toEqual({ ok: true, quote: openEnded });
  });

  test('maps stale independently timestamped quote to FX_RATE_STALE', () => {
    expect(evaluateCurrencyExchangeQuote({ ...request, decisionTime: '2026-09-22T00:10:00.000Z' }, quote, 300, 'PRODUCTION')).toEqual({
      ok: false,
      code: 'FX_RATE_STALE',
    });
  });

  test.each([
    ['PENDING approval', { ...quote, approvalStatus: 'PENDING' as const }],
    ['not effective', { ...quote, effectiveFrom: '2026-10-01T00:00:00.000Z' }],
    ['wrong purpose', { ...quote, ratePurpose: 'SELL' as never }],
    ['wrong correlation', { ...quote, correlationId: 'late-response' }],
    ['wrong policy', { ...quote, policyVersion: 'old-policy' }],
    ['wrong conversion', { ...quote, convertedAmount: '10.91' }],
    ['invalid effective end', { ...quote, effectiveTo: 'not-a-date' }],
    ['future timestamp', { ...quote, rateTimestamp: '2026-09-22T00:01:00.000Z' }],
    ['invalid booking rate', { ...quote, bookingRate: 'NaN' }],
    ['invalid converted amount', { ...quote, convertedAmount: 'NaN' }],
  ])('maps %s to FX_RATE_UNAVAILABLE', (_label, invalidQuote) => {
    expect(evaluateCurrencyExchangeQuote(request, invalidQuote, 300, 'PRODUCTION')).toEqual({ ok: false, code: 'FX_RATE_UNAVAILABLE' });
  });

  test('rejects an invalid decision time', () => {
    expect(evaluateCurrencyExchangeQuote({ ...request, decisionTime: 'not-a-date' }, quote, 300, 'PRODUCTION')).toEqual({
      ok: false,
      code: 'FX_RATE_UNAVAILABLE',
    });
  });

  test.each([0, 1.5])('rejects invalid max staleness %s', (maxStaleness) => {
    expect(evaluateCurrencyExchangeQuote(request, quote, maxStaleness, 'PRODUCTION')).toEqual({ ok: false, code: 'FX_RATE_UNAVAILABLE' });
  });

  test('production rejects virtual midpoint origin even when Buy and Sell metadata are present', () => {
    expect(
      evaluateCurrencyExchangeQuote(request, { ...quote, rateOrigin: 'VIRTUAL_DERIVED_MID', buyRate: '1.08', sellRate: '1.10' }, 300, 'PRODUCTION'),
    ).toEqual({ ok: false, code: 'FX_RATE_UNAVAILABLE' });
  });

  test('non-production virtual adapter may return the approved midpoint fixture origin', () => {
    const virtual = { ...quote, rateOrigin: 'VIRTUAL_DERIVED_MID' as const };
    expect(evaluateCurrencyExchangeQuote(request, virtual, 300, 'NON_PRODUCTION')).toEqual({ ok: true, quote: virtual });
  });

  test('USD uses USD_PAR without a provider or virtual lookup', () => {
    expect(usdParDecision({ ...request, baseCurrency: 'USD', amount: '12.34' })).toMatchObject({
      ok: true,
      quote: {
        bookingRate: '1',
        convertedAmount: '12.34',
        rateOrigin: 'USD_PAR',
        rateSource: 'USD_PAR',
      },
    });
  });

  test('USD par rejects a non-USD base, invalid time and invalid amount', () => {
    expect(usdParDecision(request)).toEqual({ ok: false, code: 'FX_RATE_UNAVAILABLE' });
    expect(usdParDecision({ ...request, baseCurrency: 'USD', decisionTime: 'invalid' })).toEqual({ ok: false, code: 'FX_RATE_UNAVAILABLE' });
    expect(usdParDecision({ ...request, baseCurrency: 'USD', amount: 'NaN' })).toEqual({ ok: false, code: 'FX_RATE_UNAVAILABLE' });
  });

  test('production configuration rejects the demo virtual adapter', () => {
    expect(() => createCurrencyExchangeAdapterConfig({ APP_ENV: 'production', CURRENCY_EXCHANGE_ADAPTER: 'VIRTUAL' })).toThrow(/VIRTUAL.*production/i);
    expect(createCurrencyExchangeAdapterConfig({ APP_ENV: 'production', CURRENCY_EXCHANGE_ADAPTER: 'PROVIDER' })).toEqual({
      environment: 'PRODUCTION',
      adapter: 'PROVIDER',
    });
  });

  test.each([
    { label: 'missing environment', env: { CURRENCY_EXCHANGE_ADAPTER: 'VIRTUAL' } },
    { label: 'misspelled environment', env: { APP_ENV: 'prodution', CURRENCY_EXCHANGE_ADAPTER: 'VIRTUAL' } },
    { label: 'NODE_ENV production', env: { NODE_ENV: 'production', CURRENCY_EXCHANGE_ADAPTER: 'VIRTUAL' } },
  ])('fails closed for virtual adapter with $label', ({ env }) => {
    expect(() => createCurrencyExchangeAdapterConfig(env)).toThrow();
  });

  test('requires an explicit recognized non-production environment before allowing the virtual adapter', () => {
    expect(createCurrencyExchangeAdapterConfig({ APP_ENV: 'test', CURRENCY_EXCHANGE_ADAPTER: 'VIRTUAL' })).toEqual({
      environment: 'NON_PRODUCTION',
      adapter: 'VIRTUAL',
    });
  });

  test('rejects conflicting production signals and an unknown adapter', () => {
    expect(() => createCurrencyExchangeAdapterConfig({ APP_ENV: 'test', NODE_ENV: 'production', CURRENCY_EXCHANGE_ADAPTER: 'PROVIDER' })).toThrow(/conflicts/);
    expect(() => createCurrencyExchangeAdapterConfig({ APP_ENV: 'test', CURRENCY_EXCHANGE_ADAPTER: 'UNKNOWN' })).toThrow(/PROVIDER or VIRTUAL/);
  });
});
