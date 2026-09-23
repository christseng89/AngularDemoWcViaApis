# Task 4.1 TDD Evidence — A8 Eligible SG Capacity Initialization

Date: 2026-09-23  
Branch: `OVERDRAWN`

## RED

- Added A8 Checker approval tests for Covered-only `80/80/0` and partial-Excess `120/100/20` cases.
- Both failed because successful A8 approval created no `sg_capacity_events` initialization fact.

## GREEN

- Added a narrow append-only `SgCapacityStore`.
- Successful A8 approval initializes exactly one `INITIALIZE` event with approved SG amount and immutable Covered／Excess attribution.
- Covered-only A8 does not require an Excess ledger event; partial-Excess A8 copies the approved Checker attribution.
- Replayed Checker Release does not duplicate capacity initialization.
- SHGT legal balance remains its independent released movement balance and is not derived from the capacity ledger.

## Validation

- Focused Maker Excess HTTP regression: 1 suite／66 tests PASS.
- Full Balance regression: 61 suites／1,229 tests PASS.
- TypeScript typecheck and build: PASS.
- ESLint: 0 errors; 22 pre-existing warnings.
