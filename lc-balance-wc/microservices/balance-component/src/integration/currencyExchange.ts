import Decimal from 'decimal.js';
import { formatMonetaryAmount, parseMonetaryAmount } from '../money';

export type CurrencyExchangeEnvironment = 'PRODUCTION' | 'NON_PRODUCTION';
export type CurrencyExchangeAdapter = 'PROVIDER' | 'VIRTUAL';
export type FxFailureCode = 'FX_RATE_UNAVAILABLE' | 'FX_RATE_STALE';
export type FxRateOrigin = 'PROVIDER_SUPPLIED' | 'USD_PAR' | 'VIRTUAL_EXPLICIT' | 'VIRTUAL_DERIVED_MID';

export interface CurrencyExchangeRequest {
  baseCurrency: string;
  quoteCurrency: 'USD';
  amount: string;
  ratePurpose: 'BOOKING';
  decisionTime: string;
  correlationId: string;
  policyVersion: string;
}

export interface CurrencyExchangeQuote {
  baseCurrency: string;
  quoteCurrency: 'USD';
  ratePurpose: 'BOOKING';
  bookingRate: string;
  convertedAmount: string;
  buyRate?: string;
  sellRate?: string;
  rateOrigin: FxRateOrigin;
  rateSource: string;
  providerRateId: string;
  providerRateVersion: string;
  rateTimestamp: string;
  approvalStatus: 'APPROVED' | 'PENDING' | 'REJECTED';
  effectiveFrom: string;
  effectiveTo: string | null;
  correlationId: string;
  policyVersion: string;
}

export interface CurrencyExchangePort {
  getBookingRate(request: CurrencyExchangeRequest): Promise<CurrencyExchangeQuote>;
}

export type FxDecision = { ok: true; quote: CurrencyExchangeQuote } | { ok: false; code: FxFailureCode };

const RATE_PATTERN = /^\d{1,12}(\.\d{1,10})?$/;

function unavailable(): FxDecision {
  return { ok: false, code: 'FX_RATE_UNAVAILABLE' };
}

function validIdentity(request: CurrencyExchangeRequest, quote: CurrencyExchangeQuote): boolean {
  return (
    quote.baseCurrency === request.baseCurrency &&
    quote.quoteCurrency === request.quoteCurrency &&
    quote.ratePurpose === request.ratePurpose &&
    quote.correlationId === request.correlationId &&
    quote.policyVersion === request.policyVersion &&
    quote.rateSource.trim() !== '' &&
    quote.providerRateId.trim() !== '' &&
    quote.providerRateVersion.trim() !== ''
  );
}

function hasAllowedOrigin(origin: FxRateOrigin, environment: CurrencyExchangeEnvironment): boolean {
  return environment === 'PRODUCTION'
    ? origin === 'PROVIDER_SUPPLIED'
    : origin === 'PROVIDER_SUPPLIED' || origin === 'VIRTUAL_EXPLICIT' || origin === 'VIRTUAL_DERIVED_MID';
}

export function evaluateCurrencyExchangeQuote(
  request: CurrencyExchangeRequest,
  quote: CurrencyExchangeQuote,
  maxStalenessSeconds: number,
  environment: CurrencyExchangeEnvironment,
): FxDecision {
  if (!validIdentity(request, quote) || quote.approvalStatus !== 'APPROVED' || !hasAllowedOrigin(quote.rateOrigin, environment)) return unavailable();
  if (!RATE_PATTERN.test(quote.bookingRate) || !Number.isInteger(maxStalenessSeconds) || maxStalenessSeconds <= 0) return unavailable();

  const decisionAt = Date.parse(request.decisionTime);
  const rateAt = Date.parse(quote.rateTimestamp);
  const effectiveFrom = Date.parse(quote.effectiveFrom);
  const effectiveTo = quote.effectiveTo === null ? Number.POSITIVE_INFINITY : Date.parse(quote.effectiveTo);
  if (![decisionAt, rateAt, effectiveFrom, effectiveTo].every((value) => Number.isFinite(value)) || rateAt > decisionAt) return unavailable();
  if (decisionAt < effectiveFrom || decisionAt >= effectiveTo) return unavailable();
  if (decisionAt - rateAt > maxStalenessSeconds * 1000) return { ok: false, code: 'FX_RATE_STALE' };

  try {
    const expectedConverted = formatMonetaryAmount(parseMonetaryAmount(request.amount).times(new Decimal(quote.bookingRate)), 2);
    const suppliedConverted = formatMonetaryAmount(parseMonetaryAmount(quote.convertedAmount), 2);
    if (expectedConverted !== suppliedConverted) return unavailable();
  } catch {
    return unavailable();
  }
  return { ok: true, quote };
}

export function usdParDecision(request: CurrencyExchangeRequest): FxDecision {
  if (request.baseCurrency !== 'USD' || request.quoteCurrency !== 'USD') return unavailable();
  const decisionAt = Date.parse(request.decisionTime);
  if (!Number.isFinite(decisionAt)) return unavailable();
  try {
    const convertedAmount = formatMonetaryAmount(parseMonetaryAmount(request.amount), 2);
    return {
      ok: true,
      quote: {
        ...request,
        bookingRate: '1',
        convertedAmount,
        rateOrigin: 'USD_PAR',
        rateSource: 'USD_PAR',
        providerRateId: 'USD_PAR',
        providerRateVersion: '1',
        rateTimestamp: request.decisionTime,
        approvalStatus: 'APPROVED',
        effectiveFrom: request.decisionTime,
        effectiveTo: null,
      },
    };
  } catch {
    return unavailable();
  }
}

export function createCurrencyExchangeAdapterConfig(env: NodeJS.ProcessEnv): {
  environment: CurrencyExchangeEnvironment;
  adapter: CurrencyExchangeAdapter;
} {
  const environment: CurrencyExchangeEnvironment = env.APP_ENV?.trim().toLowerCase() === 'production' ? 'PRODUCTION' : 'NON_PRODUCTION';
  const adapter = env.CURRENCY_EXCHANGE_ADAPTER?.trim().toUpperCase();
  if (adapter !== 'PROVIDER' && adapter !== 'VIRTUAL') throw new Error('CURRENCY_EXCHANGE_ADAPTER must be PROVIDER or VIRTUAL.');
  if (environment === 'PRODUCTION' && adapter === 'VIRTUAL') throw new Error('VIRTUAL Currency Exchange adapter is forbidden in production.');
  return { environment, adapter };
}
