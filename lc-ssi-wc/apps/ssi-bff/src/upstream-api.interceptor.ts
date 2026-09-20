const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 502, 503, 504]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface ApiRetryPolicy {
  readonly maxRetries: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly maxElapsedMs: number;
  readonly requestTimeoutMs: number;
}

type Environment = Readonly<Record<string, string | undefined>>;
type Sleep = (milliseconds: number) => Promise<void>;
type Clock = () => number;
type Random = () => number;
type FetchOutcome =
  | { readonly response: Response; readonly error?: never }
  | { readonly response?: never; readonly error: unknown };

const DEFAULT_POLICY: ApiRetryPolicy = {
  maxRetries: 3,
  initialDelayMs: 250,
  maxDelayMs: 2_000,
  maxElapsedMs: 10_000,
  requestTimeoutMs: 15_000,
};

const integerSetting = (
  environment: Environment,
  name: string,
  fallback: number,
  minimum: number,
): number => {
  const raw = environment[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimum)
    throw new Error(
      `${name} must be an integer greater than or equal to ${minimum}`,
    );
  return parsed;
};

export const readApiRetryPolicy = (
  environment: Environment = process.env,
): ApiRetryPolicy => {
  const policy = {
    maxRetries: integerSetting(
      environment,
      "API_RETRY_MAX_RETRIES",
      DEFAULT_POLICY.maxRetries,
      0,
    ),
    initialDelayMs: integerSetting(
      environment,
      "API_RETRY_INITIAL_DELAY_MS",
      DEFAULT_POLICY.initialDelayMs,
      1,
    ),
    maxDelayMs: integerSetting(
      environment,
      "API_RETRY_MAX_DELAY_MS",
      DEFAULT_POLICY.maxDelayMs,
      1,
    ),
    maxElapsedMs: integerSetting(
      environment,
      "API_RETRY_MAX_ELAPSED_MS",
      DEFAULT_POLICY.maxElapsedMs,
      1,
    ),
    requestTimeoutMs: integerSetting(
      environment,
      "API_REQUEST_TIMEOUT_MS",
      DEFAULT_POLICY.requestTimeoutMs,
      1,
    ),
  };
  if (policy.maxDelayMs < policy.initialDelayMs)
    throw new Error(
      "API_RETRY_MAX_DELAY_MS must be greater than or equal to API_RETRY_INITIAL_DELAY_MS",
    );
  return policy;
};

const methodOf = (init?: RequestInit): string =>
  String(init?.method ?? "GET").toUpperCase();

const hasIdempotencyKey = (init?: RequestInit): boolean => {
  const headers = new Headers(init?.headers);
  return headers.has("idempotency-key");
};

export const requestCanBeRetried = (init?: RequestInit): boolean =>
  SAFE_METHODS.has(methodOf(init)) || hasIdempotencyKey(init);

const retryAfterMilliseconds = (
  response: Response,
  now: number,
): number | undefined => {
  const value = response.headers?.get("retry-after")?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
};

const exponentialDelay = (
  policy: ApiRetryPolicy,
  retryNumber: number,
  random: Random,
): number => {
  const base = policy.initialDelayMs * 2 ** Math.max(0, retryNumber - 1);
  const withJitter = base + Math.floor(base * 0.5 * random());
  return Math.min(policy.maxDelayMs, withJitter);
};

const defaultSleep: Sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const inspectControlledSsiDataQualityFailure = async (
  response: Response,
): Promise<{ readonly controlled: boolean; readonly response: Response }> => {
  if (
    !response.headers?.get("content-type")?.includes("application/json") ||
    typeof response.text !== "function"
  )
    return { controlled: false, response };
  try {
    const text = await response.text();
    const replay = new Response(text, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
    const body = JSON.parse(text) as Record<string, unknown>;
    const mx = body["mx"] as Record<string, unknown> | undefined;
    return {
      controlled:
        body["code"] === "INCORRECT_SSI_CONFIGURATION" ||
        mx?.["code"] === "INCORRECT_SSI_CONFIGURATION",
      response: replay,
    };
  } catch {
    return { controlled: false, response };
  }
};

export class UpstreamApiInterceptor {
  constructor(
    private readonly environment: Environment = process.env,
    private readonly fetchImpl: typeof fetch = (...arguments_) =>
      fetch(...arguments_),
    private readonly sleep: Sleep = defaultSleep,
    private readonly clock: Clock = Date.now,
    private readonly random: Random = Math.random,
  ) {}

  async intercept(url: string, init?: RequestInit, timeoutOverrideMs?: number): Promise<Response> {
    const sharedPolicy = readApiRetryPolicy(this.environment);
    if (timeoutOverrideMs !== undefined && (!Number.isSafeInteger(timeoutOverrideMs) || timeoutOverrideMs < 1))
      throw new Error("Upstream timeout override must be a positive integer");
    const policy = timeoutOverrideMs === undefined ? sharedPolicy : {
      ...sharedPolicy,
      maxElapsedMs: timeoutOverrideMs,
      requestTimeoutMs: timeoutOverrideMs,
    };
    const retryableRequest = requestCanBeRetried(init);
    const startedAt = this.clock();
    let retryNumber = 0;

    while (true) {
      const remaining = this.remainingTime(policy, startedAt);
      const outcome = await this.tryFetchAttempt(
        url,
        init,
        Math.min(policy.requestTimeoutMs, remaining),
      );
      if ("error" in outcome) {
        if (!this.mayRetry(retryableRequest, retryNumber, policy))
          throw outcome.error;
        retryNumber += 1;
        await this.waitBeforeRetry(policy, retryNumber, startedAt);
        continue;
      }
      const inspected = await this.inspectRetryableResponse(outcome.response);
      const response = inspected.response;
      if (
        inspected.controlled ||
        !RETRYABLE_STATUS_CODES.has(response.status) ||
        !this.mayRetry(retryableRequest, retryNumber, policy)
      )
        return response;

      retryNumber += 1;
      const retryAfterMs = retryAfterMilliseconds(response, this.clock());
      await response.body?.cancel();
      await this.waitBeforeRetry(policy, retryNumber, startedAt, retryAfterMs);
    }
  }

  private remainingTime(policy: ApiRetryPolicy, startedAt: number): number {
    const remaining = policy.maxElapsedMs - (this.clock() - startedAt);
    if (remaining <= 0)
      throw new Error("Upstream retry elapsed-time limit exceeded");
    return remaining;
  }

  private mayRetry(
    retryableRequest: boolean,
    retryNumber: number,
    policy: ApiRetryPolicy,
  ): boolean {
    return retryableRequest && retryNumber < policy.maxRetries;
  }

  private async tryFetchAttempt(
    url: string,
    init: RequestInit | undefined,
    timeoutMs: number,
  ): Promise<FetchOutcome> {
    try {
      return { response: await this.fetchAttempt(url, init, timeoutMs) };
    } catch (error) {
      return { error };
    }
  }

  private inspectRetryableResponse(
    response: Response,
  ): Promise<{ readonly controlled: boolean; readonly response: Response }> {
    return RETRYABLE_STATUS_CODES.has(response.status)
      ? inspectControlledSsiDataQualityFailure(response)
      : Promise.resolve({ controlled: false, response });
  }

  private async fetchAttempt(
    url: string,
    init: RequestInit | undefined,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async waitBeforeRetry(
    policy: ApiRetryPolicy,
    retryNumber: number,
    startedAt: number,
    retryAfterMs?: number,
  ): Promise<void> {
    const calculated =
      retryAfterMs ?? exponentialDelay(policy, retryNumber, this.random);
    const delay = Math.min(policy.maxDelayMs, calculated);
    const remaining = policy.maxElapsedMs - (this.clock() - startedAt);
    if (delay >= remaining)
      throw new Error("Upstream retry elapsed-time limit exceeded");
    await this.sleep(delay);
  }
}
