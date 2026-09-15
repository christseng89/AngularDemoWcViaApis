# API Retry Policy v15.1

## Understanding summary

- The SSI BFF needs one outbound retry policy for SSI Service and Reference Service calls.
- Controllers must not implement retry loops or timing values independently.
- Retry is for transient transport or service-capacity failures, not business rejection.
- The default policy is three retries, 250 ms initial delay, 2 s delay cap, 10 s total elapsed cap, and 5 s per-attempt timeout.
- Safe methods are retryable; mutation methods require an existing `Idempotency-Key` header.
- A retry budget exhaustion fails closed and never reuses a stale resolver result.
- The behavior is configured through `.env` and covered by deterministic unit tests.

## Assumptions and non-functional constraints

- BFF is the single outbound boundary used by the browser UI.
- Normal traffic is interactive and low enough that retry amplification must remain bounded.
- The retry policy must not expose credentials, bodies, or bank data in logs.
- Existing API response contracts and status codes remain unchanged.
- This change does not add automatic retry in browsers, controllers, or downstream services.

## Final design

`UpstreamApiInterceptor` wraps outbound `fetch` calls made by the BFF. It reads and validates:

```env
API_RETRY_MAX_RETRIES=3
API_RETRY_INITIAL_DELAY_MS=250
API_RETRY_MAX_DELAY_MS=2000
API_RETRY_MAX_ELAPSED_MS=10000
API_REQUEST_TIMEOUT_MS=5000
```

It retries network/timeout errors and HTTP 408, 425, 429, 502, 503, and 504. Delay uses capped exponential backoff with jitter and honors a valid `Retry-After` value without exceeding the configured delay or elapsed-time budget. HTTP 4xx business results such as 409 and 422 are returned immediately.

GET, HEAD, and OPTIONS are retryable. POST, PUT, PATCH, and DELETE are retryable only when the caller supplied `Idempotency-Key`; the same key is preserved for every attempt. The interceptor never invents a key because the downstream service must participate in idempotency enforcement.

## Decision log

1. Centralize in the BFF outbound interceptor so every upstream integration follows one policy.
2. Use environment variables so operations can tune timing without rebuilding.
3. Bound both attempts and elapsed time to prevent retry storms and long UI hangs.
4. Keep business failures non-retryable so SSI ambiguity and option violations are not repeated.
5. Require downstream-enforced idempotency before retrying mutation methods.
