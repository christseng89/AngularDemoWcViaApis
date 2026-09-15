import {
  readApiRetryPolicy,
  requestCanBeRetried,
  UpstreamApiInterceptor,
} from "./upstream-api.interceptor";

const response = (status: number, retryAfter?: string): Response =>
  new Response(JSON.stringify({ status }), {
    status,
    headers: retryAfter ? { "retry-after": retryAfter } : undefined,
  });

const environment = (overrides: Record<string, string> = {}) => ({
  API_RETRY_MAX_RETRIES: "3",
  API_RETRY_INITIAL_DELAY_MS: "250",
  API_RETRY_MAX_DELAY_MS: "2000",
  API_RETRY_MAX_ELAPSED_MS: "10000",
  API_REQUEST_TIMEOUT_MS: "5000",
  ...overrides,
});

describe("UpstreamApiInterceptor", () => {
  it("reads one validated retry policy from environment settings", () => {
    expect(readApiRetryPolicy(environment())).toEqual({
      maxRetries: 3,
      initialDelayMs: 250,
      maxDelayMs: 2000,
      maxElapsedMs: 10000,
      requestTimeoutMs: 5000,
    });
    expect(() =>
      readApiRetryPolicy(environment({ API_RETRY_MAX_DELAY_MS: "100" })),
    ).toThrow(/greater than or equal/);
    expect(() =>
      readApiRetryPolicy(environment({ API_RETRY_MAX_RETRIES: "many" })),
    ).toThrow(/must be an integer/);
    expect(
      readApiRetryPolicy(environment({ API_RETRY_MAX_RETRIES: "   " }))
        .maxRetries,
    ).toBe(3);
  });

  it("reads the retry policy from process environment when none is supplied", () => {
    const keys = [
      "API_RETRY_MAX_RETRIES",
      "API_RETRY_INITIAL_DELAY_MS",
      "API_RETRY_MAX_DELAY_MS",
      "API_RETRY_MAX_ELAPSED_MS",
      "API_REQUEST_TIMEOUT_MS",
    ];
    const original = Object.fromEntries(
      keys.map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, environment());
    try {
      expect(readApiRetryPolicy()).toEqual({
        maxRetries: 3,
        initialDelayMs: 250,
        maxDelayMs: 2000,
        maxElapsedMs: 10000,
        requestTimeoutMs: 5000,
      });
    } finally {
      for (const key of keys) {
        if (original[key] === undefined) delete process.env[key];
        else process.env[key] = original[key];
      }
    }
  });

  it("only retries safe requests or mutations with an idempotency key", () => {
    expect(requestCanBeRetried()).toBe(true);
    expect(requestCanBeRetried({ method: "GET" })).toBe(true);
    expect(requestCanBeRetried({ method: "POST" })).toBe(false);
    expect(
      requestCanBeRetried({
        method: "POST",
        headers: { "Idempotency-Key": "stable-request-1" },
      }),
    ).toBe(true);
  });

  it("retries a transient GET with exponential delay and jitter", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200));
    const sleep = jest.fn().mockResolvedValue(undefined);
    const interceptor = new UpstreamApiInterceptor(
      environment(),
      fetchImpl,
      sleep,
      () => 0,
      () => 0,
    );

    await expect(
      interceptor.intercept("http://service.test/items"),
    ).resolves.toMatchObject({
      status: 200,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it("retries with the default fetch and sleep adapters", async () => {
    const originalFetch = global.fetch;
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200));
    global.fetch = fetchImpl;
    try {
      const interceptor = new UpstreamApiInterceptor(
        environment({
          API_RETRY_INITIAL_DELAY_MS: "1",
          API_RETRY_MAX_DELAY_MS: "1",
        }),
      );
      await expect(
        interceptor.intercept("http://service.test/items"),
      ).resolves.toMatchObject({ status: 200 });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("honors Retry-After but caps it at the configured maximum delay", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(429, "30"))
      .mockResolvedValueOnce(response(200));
    const sleep = jest.fn().mockResolvedValue(undefined);
    const interceptor = new UpstreamApiInterceptor(
      environment(),
      fetchImpl,
      sleep,
      () => 0,
    );

    await interceptor.intercept("http://service.test/items");
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it.each([
    ["Thu, 01 Jan 1970 00:00:01 GMT", 1000],
    ["not-a-retry-date", 250],
  ])("interprets Retry-After value %s", async (retryAfter, expectedDelay) => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(429, retryAfter))
      .mockResolvedValueOnce(response(200));
    const sleep = jest.fn().mockResolvedValue(undefined);
    const interceptor = new UpstreamApiInterceptor(
      environment(),
      fetchImpl,
      sleep,
      () => 0,
      () => 0,
    );

    await interceptor.intercept("http://service.test/items");
    expect(sleep).toHaveBeenCalledWith(expectedDelay);
  });

  it("does not retry business rejection or a mutation without idempotency", async () => {
    for (const [status, init] of [
      [422, undefined],
      [503, { method: "POST" }],
    ] as const) {
      const fetchImpl = jest.fn().mockResolvedValue(response(status));
      const interceptor = new UpstreamApiInterceptor(environment(), fetchImpl);
      await expect(
        interceptor.intercept("http://service.test/items", init),
      ).resolves.toMatchObject({ status });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it("does not retry controlled SSI data-quality failures", async () => {
    for (const status of [409, 500, 503]) {
      const fetchImpl = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "INCORRECT_SSI_CONFIGURATION",
            retryable: false,
          }),
          { status, headers: { "content-type": "application/json" } },
        ),
      );
      const interceptor = new UpstreamApiInterceptor(environment(), fetchImpl);

      const result = await interceptor.intercept(
        "http://service.test/settlements",
      );

      expect(result.status).toBe(status);
      await expect(result.json()).resolves.toMatchObject({
        code: "INCORRECT_SSI_CONFIGURATION",
        retryable: false,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it("recognizes a controlled SSI data-quality failure nested under mx", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ mx: { code: "INCORRECT_SSI_CONFIGURATION" } }),
          { status: 503, headers: { "content-type": "application/json" } },
        ),
      );
    const interceptor = new UpstreamApiInterceptor(environment(), fetchImpl);

    const result = await interceptor.intercept(
      "http://service.test/settlements",
    );

    expect(result.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a transient response whose JSON inspection fails", async () => {
    const malformedResponse = {
      status: 503,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => "{not-json",
    } as unknown as Response;
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(malformedResponse)
      .mockResolvedValueOnce(response(200));
    const sleep = jest.fn().mockResolvedValue(undefined);
    const interceptor = new UpstreamApiInterceptor(
      environment(),
      fetchImpl,
      sleep,
      () => 0,
      () => 0,
    );

    await expect(
      interceptor.intercept("http://service.test/settlements"),
    ).resolves.toMatchObject({ status: 200 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries a failed idempotent mutation but preserves its key", async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce(response(200));
    const sleep = jest.fn().mockResolvedValue(undefined);
    const init = {
      method: "POST",
      headers: { "Idempotency-Key": "stable-request-2" },
    };
    const interceptor = new UpstreamApiInterceptor(
      environment(),
      fetchImpl,
      sleep,
      () => 0,
      () => 0,
    );

    await interceptor.intercept("http://service.test/items", init);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1]?.[1]?.headers).toEqual(init.headers);
  });

  it("fails when the next delay would exceed the elapsed-time budget", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(503));
    const interceptor = new UpstreamApiInterceptor(
      environment({ API_RETRY_MAX_ELAPSED_MS: "200" }),
      fetchImpl,
      jest.fn(),
      () => 0,
      () => 0,
    );

    await expect(
      interceptor.intercept("http://service.test/items"),
    ).rejects.toThrow(/elapsed-time limit/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails before an attempt once the overall elapsed-time budget is exhausted", async () => {
    const fetchImpl = jest.fn();
    const clock = jest.fn().mockReturnValueOnce(0).mockReturnValueOnce(10_000);
    const interceptor = new UpstreamApiInterceptor(
      environment(),
      fetchImpl,
      jest.fn(),
      clock,
    );

    await expect(
      interceptor.intercept("http://service.test/items"),
    ).rejects.toThrow(/elapsed-time limit/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses the default fetch and sleep adapters", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200));
    const interceptor = new UpstreamApiInterceptor(
      environment({
        API_RETRY_INITIAL_DELAY_MS: "1",
        API_RETRY_MAX_DELAY_MS: "1",
      }),
    );

    try {
      await expect(
        interceptor.intercept("http://service.test/items"),
      ).resolves.toMatchObject({ status: 200 });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
