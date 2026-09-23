# Task 2.5a TDD Evidence — Direct USD→Owner Booking Contract

## Scope

- Request `fromCurrency=USD`, `toCurrency=ownerCurrency`, `amount=configuredMaximumUsd`, `ratePurpose=BOOKING`.
- Correlate response direction and `requestedAmount` with the request.
- Consume provider `convertedAmount` as the authoritative owner-currency configured cap; never recompute or invert it in Balance.
- Resolve USD owners with internal `USD_PAR` and zero provider calls.

## RED

Base: branch `OVERDRAWN`, HEAD `fdbe5f25689d077bec5e602248ad8f56333b477c`.

Command:

```text
npm test -- --runInBand --coverage=false test/unit/integration/currencyExchange.test.ts
```

Observed result: `exit code 1`, suite failed to compile with `TS2305` because `resolveConfiguredMaximumQuote` did not exist and `TS2353` because the old DTO did not accept `fromCurrency`／`toCurrency`. This proves the test preceded the contract implementation.

## GREEN

- Replaced the old owner→USD DTO direction with direct USD→owner request／quote fields.
- Added provider `requestedAmount` correlation and exact-decimal positive amount validation; USD configured maximum is constrained to at most two decimal places.
- Removed Balance-side `bookingRate × amount` authoritative recomputation.
- Added a resolver that bypasses the port for USD owners and returns exact, positive `USD_PAR`; non-USD calls the port once with the exact request and maps transport failure to `FX_RATE_UNAVAILABLE`.
- Wrong direction／amount／purpose／correlation／policy, invalid converted amount, stale and ineffective quotes fail closed.

Focused result after review corrections: `2 suites / 57 tests PASS`.

Full result: `52 suites / 981 tests PASS`.

Coverage: statements `97.99%`, branches `95.18%`, functions `98.91%`, lines `98.57%`; `currencyExchange.ts` is `100%` across all four measures.

Build, typecheck, targeted ESLint, targeted Prettier, diff-check and OpenSpec strict validation (`16 PASS / 0 FAIL`) passed.

## Candidate Binding

```text
e7b2de02053edac4d542e3b43c2aeca8f0971f6103a646f67008769b6ba3e583  microservices/balance-component/src/config/excessPolicyConfig.ts
7dc3dc8c5b2b777e1f1712a6a6d3683d22958bcda7f28a0828c17be4f7918e7d  microservices/balance-component/src/integration/currencyExchange.ts
01b4dfdd0b527bacd3053aac1a38246f95d006eead6d79666bac4170024fe137  microservices/balance-component/test/unit/config/excessPolicyConfig.test.ts
fc2073790a8fe4d7b721c2bc1cfc3e4574d66054c3d7963899bf003e7c3ee1f9  microservices/balance-component/test/unit/integration/currencyExchange.test.ts
```

## Review

- Trade Finance BA: final PASS with no business issue.
- Independent 4-Eyes: initial `REQUIRES_CHANGE` P1 x1／P2 x1; both boundary findings corrected; final PASS with no remaining P0／P1／P2.
- Independent QA: initial `REQUIRES_CHANGE`; overlapping USD／config findings plus direct provider-failure coverage corrected; final PASS with no remaining finding.

## Known Repository Quality Item

The previously discovered dependency audit finding (`js-yaml` high; `qs` moderate) is unchanged by Task 2.5a and remains open for the release security gate; it is not hidden or treated as a Task 2.5a pass.
