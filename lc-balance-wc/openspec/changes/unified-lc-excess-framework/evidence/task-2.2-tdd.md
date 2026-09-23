# Task 2.2 TDD Evidence — Owner-currency Allowance Policy

## Scope and candidate identity

- Branch: `OVERDRAWN`
- Working-tree base HEAD: `fdbe5f25689d077bec5e602248ad8f56333b477c`
- Requirement: all allowance operands／results use owner currency; configured USD enters the formula only after Currency Exchange returns `configuredMaximumOwner`; all arithmetic uses exact Decimal and owner minor-unit `ROUND_HALF_UP`.
- Candidate SHA-256:
  - `src/domain/excessPolicy.ts`: `1B86683FCB4A89CDCCD941A7A96649F26ECCB63C0120EA809D71FF72533F3FC8`
  - `test/unit/domain/excessPolicy.test.ts`: `4778609A3E36BB519EF21144A0CA691DB0CA472955208D4EFD093431177B2A53`
  - `src/integration/currencyExchange.ts`: `2FFFA2CD9CBF6D85D977323E0657306E2D4189A57A8AD4A0D43CACEF47F61BC4`
  - `test/unit/integration/currencyExchange.test.ts`: `82625EF38AEFF89CAB41C9284238B70223B6C1F3EF6DA9ACBE2FB20E4A71BEE4`

The Currency Exchange files are listed because this slice removes the unapproved pre-V4 `convertBookingAmountToUsd` draft without claiming task 2.5a complete. Final release evidence must bind a clean exact commit under task 8.4b.

## RED

Tests were changed to the approved owner-currency contract before implementation:

```text
npm test -- test/unit/domain/excessPolicy.test.ts --runInBand --coverage=false
FAIL test/unit/domain/excessPolicy.test.ts
TS2724: no exported member named computeEffectiveAllowanceLimitOwner
TS2724: no exported member named evaluateOwnerExcessAllowance
Test Suites: 1 failed, 1 total
Tests: 0 total
```

## GREEN

The implementation replaces USD allowance DTO names with owner-currency names, accepts precision 0–3, uses Decimal `ROUND_HALF_UP`, and retains `configuredMaximumUsd` only in the BD-03 policy routing input. Tests cover zero capacity, owner precision 0／2／3, half-minor rounding, exact limit, one minor unit over, zero Excess and competing reservations.

```text
npm test -- test/unit/domain/excessPolicy.test.ts test/unit/integration/currencyExchange.test.ts --runInBand --coverage=false
Test Suites: 2 passed, 2 total
Tests: 54 passed, 54 total

npm run typecheck
exit 0

npx eslint src/domain/excessPolicy.ts test/unit/domain/excessPolicy.test.ts src/integration/currencyExchange.ts test/unit/integration/currencyExchange.test.ts --no-cache
exit 0

npx prettier --check src/domain/excessPolicy.ts test/unit/domain/excessPolicy.test.ts src/integration/currencyExchange.ts test/unit/integration/currencyExchange.test.ts
All matched files use Prettier code style!

npm test -- --runInBand
Test Suites: 48 passed, 48 total
Tests: 947 passed, 947 total
Statements: 97.99%
Branches: 95.15%
Functions: 98.89%
Lines: 98.58%
```

`git diff --check` completed without whitespace errors; line-ending notices are informational.

## Deliberately still open

Task 2.2 does not change the Currency Exchange wire direction. Task 2.5a must separately drive `fromCurrency=USD`／`toCurrency=ownerCurrency`／`amount=configuredMaximumUsd`, consume provider `convertedAmount`, prohibit inversion and implement `USD_PAR` identity under its own RED／GREEN evidence.

