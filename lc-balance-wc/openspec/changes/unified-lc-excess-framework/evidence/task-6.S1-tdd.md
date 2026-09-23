# Task 6.S1 — Consolidated Angular Excess／FX Gate TDD Evidence

Date: 2026-09-23  
Branch: `OVERDRAWN`

## RED

- Added UI assertions for a successful typed Excess Maker result, Covered／Excess values, finite Minimum Required Increase guidance, and sequential A3S Eligible SG re-selection.
- Added API-client assertions that Maker Submit, compound Submit, Checker Release／Acknowledge, Fix Pending and Delete Pending carry `Idempotency-Key`.
- Added regression assertions that A3S Fix Pending is unavailable after Checker Acknowledge in both the in-session result and Maker Queue paths.
- Added an assertion that the typed Checker Excess Release envelope is unwrapped to the existing UI `BalanceMovement` contract.
- The new assertions failed before implementation, proving the gaps.

## GREEN

- The existing Maker Result panel now renders `workflowStatus`, Covered Amount, Excess Amount and Excess Decision from the compact Maker Excess success response.
- `EXCESS_LIMIT_EXCEEDED`, `FX_RATE_UNAVAILABLE` and `FX_RATE_STALE` retain the approved zero-write／retained-pending copy; no UI state or copy introduces `FX_RATE_PENDING`.
- A finite server guidance result displays Minimum Required Increase and directs the user to approved A2／B2 Increase.
- `A3S_RESELECT_ELIGIBLE_SG` displays Eligible SG alternatives first and deliberately suppresses simultaneous Minimum Required Increase guidance.
- The direct Angular API client supplies `Idempotency-Key` to every Excess-capable command boundary and unwraps Checker Excess Release without changing existing component consumers.
- After A3S Acknowledge, Amount Fix is unavailable in the Maker Result and Maker Queue; the backend BD-10 guard remains authoritative.

## Validation

- Consolidated Angular focused pack: 5 suites／560 tests PASS.
- Web-component TypeScript typecheck: PASS.
- Angular ESLint `--quiet`: PASS (0 errors).

Full Angular and cross-component regression remains deliberately assigned to Task 7.S2.
