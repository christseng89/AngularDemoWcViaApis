# Task 3.9 TDD Evidence — Formal Increase Guidance

Date: 2026-09-23  
Branch: `OVERDRAWN`

## RED

- Existing over-limit service and HTTP tests expected only `EXCESS_LIMIT_EXCEEDED`; they failed once the approved structured Minimum Required Increase contract was introduced.
- Fix Pending and A3S compound routes initially discarded the guidance payload.
- SQLite unit-of-work tests initially failed because their exact error assertions did not include guidance.
- The A2／B2 lifecycle regression was added before completion to prove that a Pending Increase is ignored, a partial Checker-released Increase still rejects with zero writes, and a sufficient Checker-released Increase permits only a new Submit.

## GREEN

- Added `minimumRequiredIncrease.ts`, using exact `Decimal` arithmetic and owner-currency minor-unit binary search against the same capacity、allowance、configured-cap、rounding and committed Excess predicate as Maker validation.
- Added `FINITE` and `INCREASE_ALONE_CANNOT_RESOLVE` outcomes, immutable calculation evidence and provider BOOKING FX contribution evidence.
- A8、A3、A3S and B3 initial over-limit Submit now return structured guidance without persisting movement、reservation、snapshot、ledger or idempotent success.
- Fix Pending returns recalculated guidance while preserving the original movement and reservation on rejection.
- A3S formal compound Submit returns guidance; Checker denial remains the approved retain-pending response and does not expose Maker guidance.
- A3S sequential guidance now first returns only capacity-improving Eligible SG alternatives, with no auto-selection, FX lookup or writes; after the Maker reselects the better SG, a still-insufficient request returns Minimum Required Increase only.
- `computeFaceAmount` and API lifecycle tests prove that only Checker-released A2／B2 monetary facts are authoritative; Pending、Rejected and Deleted facts are ignored.
- Tests prove no A2／B2 auto-create、blocked over-limit movement、Formal Increase cure／allocation event or Approved Excess reduction.

## Regression and Quality Evidence

- Focused A3S HTTP regression: 1 suite／58 tests PASS.
- Full balance-component regression: 61 suites／1,221 tests PASS (`--coverage=false`).
- New `minimumRequiredIncrease.ts`: Statements 100%、Branches 96%、Functions 100%、Lines 100%.
- TypeScript typecheck: PASS.
- ESLint: 0 errors; existing warnings only.
- Build: PASS.
- OpenSpec strict validation: 16 PASS／0 FAIL.
- Offline dependency audit at High severity: 0 vulnerabilities.
- Trade Finance BA review: PASS; no new Business Decision.
- Independent 4-Eyes review: PASS; no approved-scope blocker.
- Independent QA fresh rerun: PASS (A3S 58／58, combined MRI／A3S／Migration 71／71, full 1,221／1,221).
- The repository-wide Jest coverage gate remains below its pre-existing 95% global branch threshold; no threshold was lowered. SonarQube quality-gate execution remains in the approved later quality task.

## Incidental Migration Regression

During validation, an existing v30 database reproduced `idx_excess_decisions_movement_time already exists`. A RED migration test proved that startup schema creation can attach the index to the old snapshot table before Migration 31 renames it. Migration 31 now drops that rebuildable index before rename and recreates it on the canonical table. Migration suite 5／5 and the full 1,221-test regression pass; no business data is deleted.
