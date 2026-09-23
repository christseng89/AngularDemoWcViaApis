# Task 2.6a TDD Evidence — Non-Production Direct USD→Owner Virtual Provider

## Scope

- Extend the non-production `lc-payment-wc` virtual Currency Exchange adapter and align the Balance-side wire enum／schema constraint with the approved `DERIVED_MID` value.
- Accept `fromCurrency=USD`, `toCurrency=ownerCurrency`, `amount=configuredMaximumUsd`.
- Return provider-calculated `convertedAmount`, rounded exactly once with `ROUND_HALF_UP` to target owner-currency minor units.
- Cover explicit BOOKING, virtual BUY／SELL midpoint, missing side, stale, not Approved, not Effective and timeout fixtures.
- Do not invert a legacy owner→USD fixture. USD owners remain Balance-side `USD_PAR` and therefore do not call this adapter.

## RED

Base: branch `OVERDRAWN`, HEAD `fdbe5f25689d077bec5e602248ad8f56333b477c`.

Command:

```text
npm test -- --runInBand test/fx-booking-rate.test.js
```

Working directory: `lc-payment-wc/backend`.

Observed result: `exit code 1`, `10 failed / 6 passed`. The existing endpoint still required legacy `base`／`quote` query fields and therefore rejected direct `fromCurrency`／`toCurrency` requests with HTTP 400. This proves the direct USD→owner tests preceded implementation.

## GREEN

- Changed the virtual endpoint and quote builder to the direct `USD→owner` request／response contract.
- Added deterministic direct fixtures for midpoint, explicit BOOKING, missing side, not Approved, not Effective, timeout and JPY zero-minor-unit rounding.
- Preserved legacy owner→USD fixtures only as regression evidence and verified that the adapter never inverts them.
- Used BigInt-backed exact-decimal multiplication and a single `ROUND_HALF_UP` operation to target minor units; no JavaScript binary floating-point amount conversion is authoritative.
- Rejected non-USD source direction, zero or over-scale USD amounts, zero／malformed rates, missing provider audit evidence and invalid precision metadata.
- Correlated fixture precision with the authoritative target-currency master, covered real half-up boundaries at 0 and 3 minor units, and accepted the Balance-configured USD amount domain up to 18 integer digits.
- Changed the derived midpoint wire value from the residual `VIRTUAL_DERIVED_MID` to the approved `DERIVED_MID` across provider, Balance type, DB constraint and tests.

Focused final result: `1 suite / 43 tests PASS`.

Backend full result with coverage: `2 suites / 47 tests PASS`; `virtual-booking-rate.js` statements `98.41%`, branches `94.31%`, functions `100%`, lines `100%`.

Balance Component full regression result: `52 suites / 981 tests PASS`.

Frontend regression result: `12 suites / 354 tests PASS`; coverage statements `98.74%`, branches `95.77%`, functions `99.50%`, lines `100%`.

Angular production build passed. It retained one pre-existing SCSS budget warning (`response-viewer.component.scss`, 43 bytes above the 3.00 kB budget) and one Bootstrap selector warning.

Syntax checks for both modified JavaScript files and JSON parse validation passed.

OpenSpec strict validation passed: `16 passed / 0 failed`.

## Candidate Binding

```text
da22f72d1538d02eb7706de9d8c66b6b2bc11ac453b13b7b734efab7835e0b15  lc-payment-wc/backend/virtual-booking-rate.js
1567562118bec7214d5050bf1b744f9cde02a8b2da3e2a512e263002dabd7bbe  lc-payment-wc/backend/server.js
cc8f727783408fe3e64d5b2dff7f533a68531e1bfc926539a4f1d0b9c8e60fa7  lc-payment-wc/backend/data/fx-rates.json
a6c32906e22df2adfbbdb38b29cccf3325dfa63450f7c9a497c7f9eb18df7825  lc-payment-wc/backend/test/fx-booking-rate.test.js
6e7ce29c762d7c27c50d6c9c3475106a16650f2379f12ea2cbcb914b7f3c5acf  lc-balance-wc/microservices/balance-component/src/integration/currencyExchange.ts
e5efbd4f19649db34901e8f8ba6d0dd27c4022dc37d5a84d53dd1e001ae29a51  lc-balance-wc/microservices/balance-component/test/unit/integration/currencyExchange.test.ts
3f7e808ced076ed2a87714d10f0cf8d6553d623c6f76bc12d3780990f022f967  lc-balance-wc/microservices/balance-component/src/db/schema.ts
```

## Review

- Trade Finance BA: initial `REQUIRES_CHANGE` (approved `DERIVED_MID` wire value and zero-rate evidence); corrected; final PASS with no remaining P0／P1／P2.
- Independent 4-Eyes: initial `REQUIRES_CHANGE` (currency-master precision correlation and malformed／zero evidence); corrected; final PASS with no remaining P0／P1／P2.
- Independent QA: initial `REQUIRES_CHANGE` (18-digit configured amount domain, stale evidence and real rounding boundaries); corrected; final PASS with no remaining P0／P1／P2.

## Open Quality-Gate Item

`npm audit --audit-level=high` completed and reported five existing dependency findings: `brace-expansion` and `js-yaml` high; `body-parser` and `qs` moderate (including transitive paths). Task 2.6a does not alter dependencies. The findings remain open for the release security gate and are not represented as PASS.
