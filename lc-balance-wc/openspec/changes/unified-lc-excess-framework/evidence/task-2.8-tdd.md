# Task 2.8 TDD Evidence — FX Retry, Timeout and Active-attempt Safety

## Scope

- Map timeout, transport failure, unavailable, not Approved and not Effective to `FX_RATE_UNAVAILABLE`; map a qualifying stale result to `FX_RATE_STALE`.
- Keep retry command correlation and command idempotency identity stable while creating a fresh `requestAttemptId` for every actual provider call.
- Require the provider to echo the active attempt ID exactly on successful and typed failure responses; reject missing, malformed, late or mismatched echoes.
- Treat `providerRateVersion` as opaque immutable audit evidence only. It is required and snapshotted but is never numerically or lexically ordered.
- Preserve `USD_PAR` with zero provider calls and never create `FX_RATE_PENDING`.

## RED

Base: branch `OVERDRAWN`.

Initial retry tests failed to compile because `createCurrencyExchangeLookupSession` and attempt context did not exist. After solution B approval, the new Balance test failed because `requestAttemptId` was absent from the port context, while Payment tests failed because successful and stale responses did not echo it. The final bypass regression failed to compile against the old positional resolver, and the malformed-request test failed because a valid attempt ID was missing from the HTTP 400 response.

Representative commands:

```text
npx jest --runInBand --coverage=false test/unit/integration/currencyExchangeRetry.test.ts
npm test --prefix backend -- --runInBand test/fx-booking-rate.test.js
```

Observed RED evidence included:

- TypeScript `TS2353`: `requestAttemptId` did not exist in `CurrencyExchangeAttemptContext`.
- Payment success／stale response assertions lacked `requestAttemptId`.
- TypeScript `TS2554`: tests using the new mandatory resolver options failed against the unfenced legacy resolver signature.
- Payment malformed-amount HTTP 400 lacked an otherwise valid attempt echo.

## GREEN

- Added a bounded lookup session with timeout abort, local active-attempt fencing and stable frozen command inputs.
- Every non-USD provider call now uses a fresh UUID plus the same command correlation／idempotency identity. Both the port context and provider quote subtype require `requestAttemptId`.
- The public configured-maximum resolver delegates entirely through the fenced session and requires command identity plus timeout; no alternate non-USD provider-call path remains.
- The virtual adapter sends the attempt ID and abort signal, runtime-validates success／failure DTOs and accepts only an exact active echo. Arbitrary transport or malformed failures remain unavailable.
- The non-production Payment provider validates and echoes a nonblank attempt ID on HTTP 200, typed HTTP 503 and HTTP 400 responses where a trustworthy ID was supplied.
- Race tests prove a newer success or failure remains authoritative and an older valid late response cannot revive a superseded attempt.
- Tests use reverse-looking and nonnumeric provider version strings (`aaa-active`, `zzz-late`, `opaque-vNext`, `999999-newest-looking`) to prove provider version is not an ordering mechanism.
- Decision inputs, including environment, Max Staleness and PBD authorization evidence, are snapshotted before an asynchronous response can arrive.
- USD owners return internal `USD_PAR` and make zero provider calls.

Focused Balance result: `3 suites / 91 tests PASS`.

Payment virtual FX result: `1 suite / 44 tests PASS`; full Payment backend: `2 suites / 48 tests PASS`.

Full Balance regression: `54 suites / 1039 tests PASS`.

Coverage: statements `97.95%`, branches `95.12%`, functions `98.94%`, lines `98.61%`; `currencyExchange.ts` statements `98.05%`, branches `96.91%`, functions／lines `100%`.

Build, TypeScript typecheck, targeted Prettier, JS syntax and diff-check passed. Full ESLint has 22 pre-existing warnings and zero errors; no warning is in the Task 2.8 candidate files.

OpenSpec strict validation passed: `16 passed / 0 failed`.

## Candidate Binding

```text
2ce268081694370624010f4ad9952204330c39984b56761e7a38b0fe6304e445  microservices/balance-component/src/integration/currencyExchange.ts
343dd6855a8f1a33fa0280ae48667d1f228b72763106ec3aafc37becaf7c833a  microservices/balance-component/test/unit/integration/currencyExchange.test.ts
2ab3c211c53d0f7bd0f40fe281a886b234f0afe40da0b9631f09e44756468418  microservices/balance-component/test/unit/integration/currencyExchangeBoundary.test.ts
a5677acbbc2e1910a0f0b1a23282d4dd8b2e8759fe28f12b4dde71718eb5fa5b  microservices/balance-component/test/unit/integration/currencyExchangeRetry.test.ts
83fcbcbe0045b5d7f0caf1782ee2ca3b83ccd2d38d39c038d65cc8e3af40ac75  ../lc-payment-wc/backend/server.js
880290ed20232f10b137c0b7e64412f1827ddc1e0029f596f530509f38f46ba2  ../lc-payment-wc/backend/virtual-booking-rate.js
4ebb9fb5fd7659f616353f4bf57f022a66206c46d4b8e0eb707963c7cc55dc95  ../lc-payment-wc/backend/test/fx-booking-rate.test.js
```

## Review

- Trade Finance BA: initial `REQUIRES_CHANGE` for the unfenced resolver and incomplete HTTP 400 echo; corrected; final PASS with no P0／P1／P2.
- Independent 4-Eyes: initial `REQUIRES_CHANGE` for typed stale mapping, mutable decision inputs, USD provider bypass and later the unfenced resolver; corrected; final PASS with no P0／P1／P2.
- Independent QA: initial `REQUIRES_CHANGE` for the undefined provider-version matching contract and missing inverse race; solution B was approved, implemented and independently verified; final PASS with no P0／P1／P2.

## Open Quality-Gate Item

`npm audit --audit-level=high` still reports the existing dependency findings: `js-yaml` high and `qs`／transitive `body-parser` moderate (`4 vulnerabilities`: `1 high`, `3 moderate`). Task 2.8 adds no dependency. These remain an explicit release security-gate blocker and are not represented as PASS.
