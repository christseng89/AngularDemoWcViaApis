# Task 3.11 TDD Evidence — BD-03 Legacy Routing

Date: 2026-09-23  
Branch: `OVERDRAWN`

## Characterization First

- Added A8／A3／A3S／B3 HTTP tests with `allowancePercentage = 0`, an FX adapter that would return `FX_RATE_UNAVAILABLE` if invoked, and requests above the original Available Balance.
- Each function preserved its existing `409 INSUFFICIENT_AVAILABLE_BALANCE` code and legacy function-specific message.
- Assertions prove zero Currency Exchange calls and no movement、child contract、Excess ledger or FX snapshot persistence.
- No implementation change was required: the approved BD-03 legacy route was already selected before split、FX and Excess persistence.

## Validation

- Focused Maker Excess HTTP regression: 1 suite／65 tests PASS.
- Full Balance regression: 61 suites／1,228 tests PASS.
- TypeScript typecheck: PASS.
