# Tasks 4.2–4.6 — SG Capacity and Downstream Eligibility TDD Evidence

## Scope

- A3S partial、full and over-capacity behavior.
- A8→A3S BD-11 Excess-first attribution transfer and anti-double-counting.
- Separation of Eligible SG Capacity、SG legal redemption and owner Approved Excess.
- Full pre-Acknowledge Delete Pending rollback only; no Return or partial-cancellation path.
- A4／A6／B4／A9 downstream preservation and atomicity.

## RED

The new pre-Acknowledge A3S whole-Delete test initially failed because the LC movement became `CANCELLED` while the linked SG redemption remained `PENDING`. The same implementation also left its SG Capacity `RESERVE` open. This proved the compound pending side effects were not rolled back as one unit.

## GREEN implementation

- `SgCapacityStore` now records exact append-only `INITIALIZE → RESERVE → REDEEM|REVERSE` facts and derives outstanding attribution without changing the SHGT legal balance.
- Partial capacity allocation follows approved BD-11: consume outstanding Excess first, then Covered, using exact decimals.
- A3S Maker Submit reserves selected SG capacity; Checker Acknowledge separately releases the linked legal SG redemption and redeems the reservation exactly once.
- Parent-capacity derivation subtracts transferred Covered attribution, preventing the same A8 capacity or owner allowance from being counted twice.
- Whole pre-Acknowledge Delete Pending atomically cancels both linked A3S pending legs, releases Pending Excess and appends `REVERSE` for the exact capacity reservation. No amount or partial restoration command exists.
- The same whole rollback applies after a pre-Acknowledge Checker Reject; linked SG lookup is constrained to the same Import LC owner even when `businessEventId` collides.
- Pre-Acknowledge A3S Amount Fix atomically closes the old capacity reservation and creates the replacement reservation for the corrected linked SG amount using BD-11 Excess-first attribution.
- Post-Acknowledge Delete Pending leaves the already committed SG redemption and capacity redemption unchanged.
- Active `RESTORE` was removed from the SG-capacity type、derivation and schema. Migration 34 isolates any former RESTORE-capable table as read-only legacy audit and recreates the active table without `RESTORE`.
- A4／A6 final Release does not repeat A3S capacity or legal redemption. Standalone A9 changes only the SG legal balance and does not reduce Approved Excess or rewrite SG Capacity history. Existing B4 regression continues to preserve Approved Excess.
- Injected late Delete failure proves the complete LC leg、linked SG leg、Pending Excess、capacity facts、delete audit and idempotency record roll back together.

## Tests

- Focused Task 4 regression:
  - `npm test -- --runInBand --coverage=false --silent test/unit/db/excessSchema.test.ts test/unit/store/sgCapacityStore.test.ts test/unit/makerExcessApi.test.ts`
  - Result: **3 suites / 88 tests PASS**.
- Full Balance microservice regression:
  - `npm test -- --runInBand --coverage=false --silent`
  - Result: **62 suites / 1,240 tests PASS**.
- Static and package validation:
  - `npm run typecheck` — PASS.
  - `npm run lint` — PASS with 0 errors and 22 pre-existing warnings.
  - `npm run build` — PASS.
  - `openspec validate --all --strict --no-interactive` — **16 PASS / 0 FAIL**.

## Independent review

- Trade Finance BA: **PASS** — BD-07／BD-08／BD-11、Fix replacement attribution、same-owner linkage and removal of active RESTORE are consistent; no new Business Decision.
- 4-Eyes engineering review: **PASS** after closing rejected-state Delete and owner-collision blockers.
- Independent QA: **PASS** after proving post-Acknowledge capacity preservation and injected late-failure atomic rollback.
