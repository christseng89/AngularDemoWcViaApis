import Decimal from 'decimal.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { parseMonetaryAmount } from '../money';

export type CurrencyExchangeEnvironment = 'PRODUCTION' | 'NON_PRODUCTION';
export type CurrencyExchangeAdapter = 'PROVIDER' | 'VIRTUAL';
export type FxFailureCode = 'FX_RATE_UNAVAILABLE' | 'FX_RATE_STALE';
export type FxRateOrigin = 'PROVIDER_SUPPLIED' | 'USD_PAR' | 'VIRTUAL_EXPLICIT' | 'DERIVED_MID';

export interface CurrencyExchangeRequest {
  fromCurrency: 'USD';
  toCurrency: string;
  amount: string;
  ratePurpose: 'BOOKING';
  decisionTime: string;
  correlationId: string;
  policyVersion: string;
}

export interface CurrencyExchangeQuote {
  fromCurrency: 'USD';
  toCurrency: string;
  requestedAmount: string;
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
  requestAttemptId?: string;
  fallbackReason?: string;
  rateDate?: string;
  fallbackPolicyId?: string;
  fallbackPolicyVersion?: string;
}

export interface CurrencyExchangeProviderQuote extends CurrencyExchangeQuote {
  requestAttemptId: string;
}

export interface CurrencyExchangePort {
  getBookingRate(request: CurrencyExchangeRequest, context: CurrencyExchangeAttemptContext): Promise<CurrencyExchangeProviderQuote>;
}

export interface CurrencyExchangeAttemptContext {
  signal: AbortSignal;
  commandIdempotencyKey: string;
  requestAttemptId: string;
}

export type FxDecision = { ok: true; quote: CurrencyExchangeQuote } | { ok: false; code: FxFailureCode };

export type PbdFallbackAuthorizationEvidence =
  Readonly<{ authorized: false }> | Readonly<{ authorized: true; fallbackPolicyId: string; fallbackPolicyVersion: string }>;

const NO_PBD_FALLBACK_AUTHORIZATION: PbdFallbackAuthorizationEvidence = Object.freeze({ authorized: false });

export interface CurrencyExchangeAdapterConfig {
  environment: CurrencyExchangeEnvironment;
  adapter: CurrencyExchangeAdapter;
}

export interface VirtualCurrencyExchangeFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type VirtualCurrencyExchangeFetch = (
  url: string,
  init: Readonly<{
    method: 'GET';
    signal?: AbortSignal;
    headers: Readonly<{ Accept: 'application/json'; 'X-Command-Idempotency-Key'?: string }>;
  }>,
) => Promise<VirtualCurrencyExchangeFetchResponse>;

export interface CurrencyExchangeLookupSession {
  lookup(port: CurrencyExchangePort, timeoutMs: number): Promise<FxDecision>;
  activeAttemptNumber(): number;
}

export interface CurrencyExchangeLookupSessionOptions {
  request: CurrencyExchangeRequest;
  commandIdempotencyKey: string;
  maxStalenessSeconds: number;
  environment: CurrencyExchangeEnvironment;
  pbdAuthorization?: PbdFallbackAuthorizationEvidence;
}

export interface ResolveConfiguredMaximumQuoteOptions extends Omit<CurrencyExchangeLookupSessionOptions, 'request'> {
  timeoutMs: number;
}

const RATE_PATTERN = /^\d{1,12}(\.\d{1,10})?$/;
const USD_AMOUNT_PATTERN = /^\d{1,18}(\.\d{1,2})?$/;
const currencyExchangeQuoteSchema = z.object({
  fromCurrency: z.literal('USD'),
  toCurrency: z.string().min(1),
  requestedAmount: z.string().min(1),
  ratePurpose: z.literal('BOOKING'),
  bookingRate: z.string().min(1),
  convertedAmount: z.string().min(1),
  buyRate: z.string().optional(),
  sellRate: z.string().optional(),
  rateOrigin: z.enum(['PROVIDER_SUPPLIED', 'USD_PAR', 'VIRTUAL_EXPLICIT', 'DERIVED_MID']),
  rateSource: z.string().min(1),
  providerRateId: z.string().min(1),
  providerRateVersion: z.string().min(1),
  rateTimestamp: z.string().min(1),
  approvalStatus: z.enum(['APPROVED', 'PENDING', 'REJECTED']),
  effectiveFrom: z.string().min(1),
  effectiveTo: z.string().nullable(),
  correlationId: z.string().min(1),
  policyVersion: z.string().min(1),
  requestAttemptId: z.string().min(1),
  fallbackReason: z.string().optional(),
  rateDate: z.string().optional(),
  fallbackPolicyId: z.string().optional(),
  fallbackPolicyVersion: z.string().optional(),
});
const currencyExchangeFailureSchema = z.object({
  code: z.enum(['FX_RATE_UNAVAILABLE', 'FX_RATE_STALE']),
  requestAttemptId: z.string().min(1),
});

class CurrencyExchangePortFailure extends Error {
  constructor(readonly code: FxFailureCode) {
    super(code);
    this.name = 'CurrencyExchangePortFailure';
  }
}

function unavailable(): FxDecision {
  return { ok: false, code: 'FX_RATE_UNAVAILABLE' };
}

function validIdentity(request: CurrencyExchangeRequest, quote: CurrencyExchangeQuote, expectedRequestAttemptId?: string): boolean {
  try {
    return (
      request.fromCurrency === 'USD' &&
      quote.fromCurrency === request.fromCurrency &&
      quote.toCurrency === request.toCurrency &&
      parseMonetaryAmount(quote.requestedAmount).equals(parseMonetaryAmount(request.amount)) &&
      parseMonetaryAmount(request.amount).greaterThan(0) &&
      parseMonetaryAmount(quote.convertedAmount).greaterThan(0) &&
      quote.ratePurpose === request.ratePurpose &&
      quote.correlationId === request.correlationId &&
      quote.policyVersion === request.policyVersion &&
      (expectedRequestAttemptId === undefined || quote.requestAttemptId === expectedRequestAttemptId) &&
      quote.rateSource.trim() !== '' &&
      quote.providerRateId.trim() !== '' &&
      quote.providerRateVersion.trim() !== ''
    );
  } catch {
    return false;
  }
}

function hasAllowedOrigin(origin: FxRateOrigin, environment: CurrencyExchangeEnvironment): boolean {
  return environment === 'PRODUCTION'
    ? origin === 'PROVIDER_SUPPLIED'
    : origin === 'PROVIDER_SUPPLIED' || origin === 'VIRTUAL_EXPLICIT' || origin === 'DERIVED_MID';
}

function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function hasAnyPbdEvidence(quote: CurrencyExchangeQuote): boolean {
  return (
    quote.fallbackReason !== undefined || quote.rateDate !== undefined || quote.fallbackPolicyId !== undefined || quote.fallbackPolicyVersion !== undefined
  );
}

function applyPbdPolicyBoundary(
  quote: CurrencyExchangeQuote,
  environment: CurrencyExchangeEnvironment,
  authorization: PbdFallbackAuthorizationEvidence,
  decisionAt: number,
  rateAt: number,
): CurrencyExchangeQuote | null {
  if (!hasAnyPbdEvidence(quote)) return quote;
  if (
    environment !== 'PRODUCTION' ||
    quote.rateOrigin !== 'PROVIDER_SUPPLIED' ||
    !authorization.authorized ||
    typeof authorization.fallbackPolicyId !== 'string' ||
    authorization.fallbackPolicyId.trim() === '' ||
    typeof authorization.fallbackPolicyVersion !== 'string' ||
    authorization.fallbackPolicyVersion.trim() === '' ||
    quote.fallbackReason !== 'PREVIOUS_BUSINESS_DAY' ||
    !isValidDateOnly(quote.rateDate) ||
    quote.rateDate !== new Date(rateAt).toISOString().slice(0, 10) ||
    quote.rateDate >= new Date(decisionAt).toISOString().slice(0, 10) ||
    quote.fallbackPolicyId !== undefined ||
    quote.fallbackPolicyVersion !== undefined
  )
    return null;
  return {
    ...quote,
    fallbackPolicyId: authorization.fallbackPolicyId,
    fallbackPolicyVersion: authorization.fallbackPolicyVersion,
  };
}

export function evaluateCurrencyExchangeQuote(
  request: CurrencyExchangeRequest,
  quote: CurrencyExchangeQuote,
  maxStalenessSeconds: number,
  environment: CurrencyExchangeEnvironment,
  pbdAuthorization: PbdFallbackAuthorizationEvidence = NO_PBD_FALLBACK_AUTHORIZATION,
  expectedRequestAttemptId?: string,
): FxDecision {
  if (!validIdentity(request, quote, expectedRequestAttemptId) || quote.approvalStatus !== 'APPROVED' || !hasAllowedOrigin(quote.rateOrigin, environment))
    return unavailable();
  if (!RATE_PATTERN.test(quote.bookingRate) || !new Decimal(quote.bookingRate).greaterThan(0)) return unavailable();
  if (!Number.isInteger(maxStalenessSeconds) || maxStalenessSeconds <= 0) return unavailable();

  const decisionAt = Date.parse(request.decisionTime);
  const rateAt = Date.parse(quote.rateTimestamp);
  const effectiveFrom = Date.parse(quote.effectiveFrom);
  const effectiveTo = quote.effectiveTo === null ? Number.POSITIVE_INFINITY : Date.parse(quote.effectiveTo);
  if (
    ![decisionAt, rateAt, effectiveFrom].every((value) => Number.isFinite(value)) ||
    (quote.effectiveTo !== null && !Number.isFinite(effectiveTo)) ||
    rateAt > decisionAt
  )
    return unavailable();
  if (decisionAt < effectiveFrom || decisionAt >= effectiveTo) return unavailable();
  const policyBoundQuote = applyPbdPolicyBoundary(quote, environment, pbdAuthorization, decisionAt, rateAt);
  if (policyBoundQuote === null) return unavailable();
  if (decisionAt - rateAt > maxStalenessSeconds * 1000) return { ok: false, code: 'FX_RATE_STALE' };

  return { ok: true, quote: policyBoundQuote };
}

export function usdParDecision(request: CurrencyExchangeRequest): FxDecision {
  if (request.fromCurrency !== 'USD' || request.toCurrency !== 'USD') return unavailable();
  const decisionAt = Date.parse(request.decisionTime);
  if (!Number.isFinite(decisionAt)) return unavailable();
  try {
    const amount = parseMonetaryAmount(request.amount);
    if (!USD_AMOUNT_PATTERN.test(request.amount) || !amount.greaterThan(0)) return unavailable();
    return {
      ok: true,
      quote: {
        ...request,
        requestedAmount: request.amount,
        bookingRate: '1',
        convertedAmount: request.amount,
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

export async function resolveConfiguredMaximumQuote(
  request: CurrencyExchangeRequest,
  port: CurrencyExchangePort,
  options: ResolveConfiguredMaximumQuoteOptions,
): Promise<FxDecision> {
  return createCurrencyExchangeLookupSession({
    request,
    commandIdempotencyKey: options.commandIdempotencyKey,
    maxStalenessSeconds: options.maxStalenessSeconds,
    environment: options.environment,
    pbdAuthorization: options.pbdAuthorization,
  }).lookup(port, options.timeoutMs);
}

export function createCurrencyExchangeLookupSession(options: CurrencyExchangeLookupSessionOptions): CurrencyExchangeLookupSession {
  const commandIdempotencyKey = options.commandIdempotencyKey.trim();
  if (commandIdempotencyKey === '') throw new Error('Currency Exchange command idempotency key must not be blank.');

  const stableRequest = Object.freeze({ ...options.request });
  const maxStalenessSeconds = options.maxStalenessSeconds;
  const environment = options.environment;
  const pbdAuthorization: PbdFallbackAuthorizationEvidence =
    options.pbdAuthorization?.authorized === true
      ? Object.freeze({
          authorized: true,
          fallbackPolicyId: options.pbdAuthorization.fallbackPolicyId,
          fallbackPolicyVersion: options.pbdAuthorization.fallbackPolicyVersion,
        })
      : Object.freeze({ authorized: false });
  let activeAttempt = 0;
  let activeController: AbortController | undefined;

  return {
    activeAttemptNumber: () => activeAttempt,
    async lookup(port, timeoutMs) {
      if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
        throw new Error('Currency Exchange timeout must be a positive integer.');
      }
      if (stableRequest.toCurrency === 'USD') return usdParDecision(stableRequest);

      const attempt = ++activeAttempt;
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      const requestAttemptId = randomUUID();

      const providerOutcome = Promise.resolve()
        .then(() => port.getBookingRate(stableRequest, { signal: controller.signal, commandIdempotencyKey, requestAttemptId }))
        .then(
          (providerQuote) => ({ type: 'quote' as const, quote: providerQuote }),
          (error: unknown) => ({
            type: 'failure' as const,
            code: error instanceof CurrencyExchangePortFailure ? error.code : ('FX_RATE_UNAVAILABLE' as const),
          }),
        );
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const timeoutOutcome = new Promise<{ type: 'timeout' }>((resolve) => {
        timeoutHandle = setTimeout(() => resolve({ type: 'timeout' }), timeoutMs);
      });

      const outcome = await Promise.race([providerOutcome, timeoutOutcome]);
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      if (attempt !== activeAttempt) return unavailable();
      if (outcome.type === 'timeout') {
        controller.abort();
        return unavailable();
      }
      if (outcome.type === 'failure') return { ok: false, code: outcome.code };
      return evaluateCurrencyExchangeQuote(stableRequest, outcome.quote, maxStalenessSeconds, environment, pbdAuthorization, requestAttemptId);
    },
  };
}

export function createCurrencyExchangeAdapterConfig(env: NodeJS.ProcessEnv): CurrencyExchangeAdapterConfig {
  const appEnvironment = env.APP_ENV?.trim().toLowerCase();
  const nodeEnvironment = env.NODE_ENV?.trim().toLowerCase();
  const nonProductionValues = new Set(['development', 'test', 'local', 'non-production']);
  if (appEnvironment !== undefined && appEnvironment !== 'production' && !nonProductionValues.has(appEnvironment)) {
    throw new Error('APP_ENV must be production, development, test, local or non-production.');
  }
  if (appEnvironment === undefined && nodeEnvironment !== 'production') {
    throw new Error('APP_ENV must explicitly identify a recognized environment.');
  }
  if (nodeEnvironment === 'production' && appEnvironment !== undefined && appEnvironment !== 'production') {
    throw new Error('APP_ENV conflicts with NODE_ENV=production.');
  }
  const environment: CurrencyExchangeEnvironment = appEnvironment === 'production' || nodeEnvironment === 'production' ? 'PRODUCTION' : 'NON_PRODUCTION';
  const adapter = env.CURRENCY_EXCHANGE_ADAPTER?.trim().toUpperCase();
  if (adapter !== 'PROVIDER' && adapter !== 'VIRTUAL') throw new Error('CURRENCY_EXCHANGE_ADAPTER must be PROVIDER or VIRTUAL.');
  if (environment === 'PRODUCTION' && adapter === 'VIRTUAL') throw new Error('VIRTUAL Currency Exchange adapter is forbidden in production.');
  return { environment, adapter };
}

export function createVirtualCurrencyExchangeAdapter(
  options: Readonly<{
    config: CurrencyExchangeAdapterConfig;
    endpoint: string;
    maxStalenessSeconds: number;
    fetchImpl?: VirtualCurrencyExchangeFetch;
  }>,
): CurrencyExchangePort {
  if (options.config.environment !== 'NON_PRODUCTION' || options.config.adapter !== 'VIRTUAL') {
    throw new Error('Virtual Currency Exchange adapter requires an explicit non-production VIRTUAL configuration.');
  }
  if (!Number.isInteger(options.maxStalenessSeconds) || options.maxStalenessSeconds <= 0) {
    throw new Error('Virtual Currency Exchange maxStalenessSeconds must be a positive integer.');
  }
  let endpoint: URL;
  try {
    endpoint = new URL(options.endpoint);
  } catch {
    throw new Error('Virtual Currency Exchange endpoint must be an absolute HTTP(S) URL.');
  }
  if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
    throw new Error('Virtual Currency Exchange endpoint must be an absolute HTTP(S) URL.');
  }
  const fetchImpl: VirtualCurrencyExchangeFetch = options.fetchImpl ?? (fetch as VirtualCurrencyExchangeFetch);

  return {
    async getBookingRate(request, context) {
      if (context === undefined) throw new Error('Currency Exchange attempt context is required.');
      if (context.commandIdempotencyKey.trim() === '') throw new Error('Currency Exchange command idempotency key must not be blank.');
      if (context.requestAttemptId.trim() === '') throw new Error('Currency Exchange request attempt ID must not be blank.');
      const url = new URL(endpoint);
      url.search = new URLSearchParams({
        fromCurrency: request.fromCurrency,
        toCurrency: request.toCurrency,
        amount: request.amount,
        decisionTime: request.decisionTime,
        correlationId: request.correlationId,
        policyVersion: request.policyVersion,
        requestAttemptId: context.requestAttemptId,
        maxStalenessSeconds: String(options.maxStalenessSeconds),
      }).toString();
      const init = {
        method: 'GET',
        signal: context.signal,
        headers: { Accept: 'application/json', 'X-Command-Idempotency-Key': context.commandIdempotencyKey },
      } as const;
      const response = await fetchImpl(url.toString(), init);
      if (!response.ok) {
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw new Error(`Virtual Currency Exchange returned HTTP ${response.status}.`);
        }
        const failure = currencyExchangeFailureSchema.safeParse(payload);
        if (failure.success && failure.data.requestAttemptId === context.requestAttemptId) {
          throw new CurrencyExchangePortFailure(failure.data.code);
        }
        throw new Error(`Virtual Currency Exchange returned HTTP ${response.status}.`);
      }
      const payload = await response.json();
      const parsed = currencyExchangeQuoteSchema.safeParse(payload);
      if (!parsed.success) throw new Error('Virtual Currency Exchange returned a malformed response.');
      if (parsed.data.requestAttemptId !== context.requestAttemptId) {
        throw new Error('Virtual Currency Exchange returned a non-active request attempt ID.');
      }
      return parsed.data;
    },
  };
}
