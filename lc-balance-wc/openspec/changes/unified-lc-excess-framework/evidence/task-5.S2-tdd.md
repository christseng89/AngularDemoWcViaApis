# Task 5.S2 — Consolidated API／OpenAPI Contract TDD Evidence

Date: 2026-09-23  
Branch: `OVERDRAWN`

## RED

- Added `microservices/balance-component/test/unit/contract/excessOpenApi.test.ts`.
- The first valid-path run failed three assertions because the OpenAPI document did not yet publish the typed Excess／FX schemas, Idempotency-Key parameter, whole Delete Pending boundary, Maker zero-write contract or Checker retained-pending contract.

## GREEN

- Updated `analysis/balance-component-api.yaml` with:
  - typed `MakerExcessAccepted`, `CheckerExcessAccepted`, `ExcessCommandError`, `MinimumRequiredIncrease` and `FxRateEvidence` schemas;
  - `Idempotency-Key` authority and conflict contract;
  - production provider-supplied BOOKING-only／Freshness boundary and non-production midpoint restriction;
  - Maker zero-write and Checker retained-pending failure contracts;
  - BD-03 zero-value legacy routing;
  - whole Delete Pending and the explicit absence of partial Return／Cancellation／cure commands;
  - A3／A3S／A8／B3 compound, concurrency and typed response linkage to the implemented HTTP surface.

## Validation

- Focused OpenAPI contract: 1 suite／3 tests PASS.
- Consolidated HTTP + OpenAPI pack: 2 suites／76 tests PASS.
- YAML parse: PASS (`js-yaml`).
- TypeScript typecheck: PASS.
- ESLint `--quiet`: PASS (0 errors).
- `git diff --check`: PASS.
- `openspec validate --all --strict --no-interactive`: 16 PASS／0 FAIL.

The focused Jest command used the repository-local Jest binary to avoid rerunning the already-generated calendar through a sandbox-rewritten relative `pretest` path. This changed no application behavior and the two target suites completed normally.
