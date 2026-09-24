# Embedded Virtual FX for LC Balance Demo

## Understanding Summary

- `lc-balance-wc` must run its non-production BOOKING-rate flow without depending on `lc-payment-wc`.
- The existing Balance backend will expose `GET /api/fx/booking-rate` on port 4300.
- `CURRENCY_EXCHANGE_ENDPOINT` will point to `http://localhost:4300/api/fx/booking-rate`.
- The existing request, response, approval, effectiveness, freshness, rounding, audit-evidence and fail-closed contracts remain unchanged.
- `npm run dev:all` remains the single startup command; no additional process or port is introduced.
- The virtual provider remains demo-only. Production must continue to reject the virtual adapter/source and use an approved provider.
- `lc-payment-wc` is outside the change scope and will not be modified.

## Assumptions and Non-Functional Requirements

- Demo-scale traffic only; the existing Express backend capacity is sufficient.
- No additional cache, persistence or availability layer is required.
- Virtual quote fixtures are maintained by `lc-balance-wc` and contain no secrets or personal data.
- The endpoint retains deterministic decimal arithmetic and owner-currency rounding.
- Invalid, missing, stale, non-approved or non-effective evidence fails closed.
- The Balance microservice continues to consume the quote through HTTP so the production service boundary remains representative.

## Selected Design

The existing `lc-balance-wc/backend` Express process owns the virtual FX endpoint and its local fixture. The Balance microservice calls that endpoint using the configured `CURRENCY_EXCHANGE_ENDPOINT`. Angular remains unaware of the fixture and continues to interact with the Balance APIs normally.

```text
Angular :4200
    |
    +--> Balance backend :4300
             +--> GET /api/fx/booking-rate (virtual demo provider)
             |
             +--> Balance microservice :4100
                         |
                         +--> Currency Exchange endpoint :4300
```

The provider implementation, fixture, route validation and contract tests are copied into the Balance repository boundary and adapted without importing files from `lc-payment-wc` at runtime.

## Error Handling

- Invalid request shape: `400 INVALID_FX_REQUEST`.
- Missing, invalid, non-approved or non-effective quote: fail closed with `FX_RATE_UNAVAILABLE`.
- Quote outside the authorized freshness window: fail closed with `FX_RATE_STALE`.
- Injected demo timeout evidence: fail closed without deriving or inventing a quote.
- The virtual-adapter response marker remains present so production safeguards can reject the source.

## Testing Strategy

1. Add endpoint contract tests to the Balance backend first and confirm RED.
2. Add the provider module, fixture and Express route until GREEN.
3. Verify exact BOOKING, BUY/SELL fallback behavior already authorized for the demo, rounding boundaries, freshness and negative cases.
4. Run backend tests and coverage, Balance microservice integration tests, typecheck and lint.
5. Run the complete LC Balance regression and SonarQube validation before commit.

## Decision Log

| Decision | Alternatives | Reason |
|---|---|---|
| Embed in existing Balance backend on port 4300 | Separate Balance-owned process on port 3001; retain LC Payment dependency | One startup command, no extra service, no cross-WC runtime dependency |
| Preserve HTTP service boundary | Directly import fixture into the microservice | Keeps production architecture representative and preserves adapter validation |
| Copy and own the provider contract in LC Balance | Runtime import from sibling folder | LC Balance must be independently deployable and testable |
| Keep virtual provider non-production only | Reuse it in production | Demo rates are fixtures and are not an approved production source |

## Explicit Non-Goals

- No production Currency Exchange implementation.
- No authorization lookup microservice.
- No changes to LC Payment calculations or UI.
- No new port, process, database table or distributed cache.
