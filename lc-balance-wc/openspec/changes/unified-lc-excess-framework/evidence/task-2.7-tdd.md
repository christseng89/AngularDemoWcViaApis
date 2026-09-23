# Task 2.7 TDD Evidence — Balance Virtual Adapter and Production PBD Boundary

## Scope

- Add a Balance-side adapter for the non-production `lc-payment-wc` direct USD→owner virtual BOOKING endpoint.
- Prevent construction of that adapter unless configuration is explicitly `NON_PRODUCTION`／`VIRTUAL`; production configuration remains fail-closed.
- Production accepts only provider-supplied BOOKING and never derives from BUY／SELL or accepts virtual origins.
- PBD BOOKING requires explicit effective FX Policy authorization, Approved／Effective／Freshness checks and complete immutable audit evidence: policy ID/version, fallback reason, rate date and rate source.

## RED

Base: branch `OVERDRAWN`, HEAD `fdbe5f25689d077bec5e602248ad8f56333b477c`.

Command:

```text
npm test -- --runInBand --coverage=false test/unit/integration/currencyExchangeBoundary.test.ts
```

Observed result: `exit code 1`; the suite failed to compile because `createVirtualCurrencyExchangeAdapter`, PBD quote evidence fields and the authorization parameter did not exist. This proves the boundary tests preceded implementation.

## GREEN

- Added a direct GET virtual adapter which forwards exact request direction, configured USD amount, decision time, correlation, policy version and Max Staleness.
- Adapter construction requires explicit `NON_PRODUCTION`／`VIRTUAL`, a positive integer Max Staleness and an absolute HTTP(S) endpoint. Non-success responses and HTTP 200 bodies that fail the runtime quote DTO schema reject the port call for fail-closed mapping.
- Kept the production origin allow-list at `PROVIDER_SUPPLIED`; missing BOOKING with only BUY／SELL remains `FX_RATE_UNAVAILABLE`.
- Added PBD evidence fields and policy binding. Any partial, malformed, unauthorized, non-provider or provider-spoofed fallback evidence fails closed. The technical wire reason is exactly `PREVIOUS_BUSINESS_DAY`; `rateDate` must equal the provider timestamp UTC date and precede the decision UTC date. Balance does not itself calculate weekends／holidays; provider and FX Policy remain authoritative for the business-day selection.
- A successful PBD decision snapshots the effective policy ID/version supplied by Balance together with provider fallback reason, rate date and source. Authorization does not relabel an ordinary current provider quote as PBD.
- Approved／Effective checks run before acceptance; an authorized quote beyond Max Staleness returns `FX_RATE_STALE`.

Focused result: `2 suites / 67 tests PASS`.

Full Balance regression: `53 suites / 1015 tests PASS`.

Coverage: statements `98.02%`, branches `95.24%`, functions `98.92%`, lines `98.59%`; `currencyExchange.ts` statements／functions／lines `100%`, branches `99.23%`.

Build, TypeScript typecheck, targeted and full ESLint, targeted Prettier and diff-check passed. Full ESLint contains 22 pre-existing warnings and zero errors; no warning is in the Task 2.7 candidate files.

OpenSpec strict validation passed: `16 passed / 0 failed`.

## Candidate Binding

```text
423b71f0e65c41df0a766c96ddf233043934b2811bf4107b06f021d3ebf237d0  microservices/balance-component/src/integration/currencyExchange.ts
c419bf42ddc04cb95b61eef3dc90cb25fd5b1c0d9f1841f64eb5597421d1ad9e  microservices/balance-component/test/unit/integration/currencyExchange.test.ts
e5afc564740ab12e5ebc3e1bd0c22236eba23dcc4dc81c91f28b6a1771267730  microservices/balance-component/test/unit/integration/currencyExchangeBoundary.test.ts
```

## Review

- Trade Finance BA: final PASS with no remaining P0／P1／P2.
- Independent 4-Eyes: initial `REQUIRES_CHANGE` (PBD reason/date spoofing and incomplete HTTP 200 payload validation); corrected; final PASS with no remaining P0／P1／P2.
- Independent QA: initial `REQUIRES_CHANGE` with the same two findings; corrected; final PASS with no remaining P0／P1／P2.

## Open Quality-Gate Item

`npm audit --audit-level=high` completed and reported the existing `js-yaml` high plus `qs`／transitive `body-parser` moderate findings (`4 vulnerabilities`: `1 high`, `3 moderate`). Task 2.7 changes no dependency. These remain open for the release security gate and are not represented as PASS.
