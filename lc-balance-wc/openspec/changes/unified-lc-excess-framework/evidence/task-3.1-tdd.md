# Task 3.1 TDD Evidence — Maker Excess Submit Orchestration（Partially Superseded Contract）

> Historical evidence only for its over-limit HTTP 201／persisted blocked assertions. Those assertions were superseded by user-approved BD-06 revision on 2026-09-23 and are remediated under Task 3.3a; the remaining persistence and atomicity evidence stays historical implementation evidence.

## Scope

- Prove the Maker order: scoped idempotency, authoritative current facts, unconditional currency invariant, effective policy, Covered／Excess split, FX, transactional idempotency claim, facts-version revalidation, allowance lock and atomic persistence.
- Preserve BD-03: `configuredMaximumUsd = 0 OR allowancePercentage = 0` uses legacy sufficiency with zero FX and zero Excess persistence, but never bypasses the transaction-currency／owner-currency invariant.
- Preserve BD-01: unavailable／stale FX opens no persistence transaction.
- Persist a calculable over-limit request as HTTP 201 `PENDING / LIMIT_EXCEEDED / EXCESS_LIMIT_EXCEEDED / BLOCKED`.
- Define only the narrow orchestration ports needed by Task 3.2; concrete stores and `balanceService.ts` integration remain open.

## RED

Base: branch `OVERDRAWN`.

The first focused test failed with TypeScript `TS2307` because `makerExcessSubmitService.ts` did not exist. Subsequent review-driven RED cycles proved three missing contracts:

- TypeScript errors for absent transactional idempotency claim and facts-version validation ports.
- Preflight-CONFLICT and concurrent preflight-MISS regressions were initially absent.
- Both OR-zero currency-mismatch cases incorrectly resolved to `{ kind: 'LEGACY_SUBMIT' }` instead of rejecting with typed `CurrencyMismatchError` before policy routing.

Representative command:

```text
npx jest --runInBand --coverage=false test/unit/service/makerExcessSubmitService.test.ts
```

## GREEN

- The exact preflight scope is `commandType + ownerId + actorContext + key + requestHash`; replay and conflict stop before domain reads, FX or writes.
- A second idempotency claim inside the UoW deterministically handles concurrent same-hash replay and different-hash conflict before facts validation, allowance lock or persistence.
- Current facts carry an authoritative `factsVersion`. The transaction validates that version after FX but before locking allowance; stale facts abort without persistence.
- Persistence failure propagates through the UoW boundary so claim, movement and Pending Excess facts participate in the same rollback contract.
- `assertExcessOwnerCurrencyInvariant` runs immediately after facts identity validation and before policy resolution／BD-03 routing. Both zero-side mismatch cases prove zero policy, legacy, FX, UoW and persistence calls.
- Matching-currency zero-policy and covered-only requests use legacy processing with zero external FX／Excess UoW.
- USD owners use `USD_PAR` with zero provider calls. Non-USD uses the approved BOOKING-rate contract.
- Allowance is evaluated from the locked current aggregate; within-limit and calculable over-limit responses persist the policy, FX, idempotency and audit snapshots.

Focused result: `1 suite / 17 tests PASS`.

Full Balance regression: `55 suites / 1056 tests PASS`.

Coverage: statements `97.91%`, branches `95.10%`, functions `98.95%`, lines `98.64%`; `makerExcessSubmitService.ts` statements `96.22%`, branches `93.10%`, functions／lines `100%`.

Root UI regression: `70 suites / 2026 tests PASS`; coverage statements `98.03%`, branches `95.12%`, functions `96.64%`, lines `98.55%`.

TypeScript typecheck, build, targeted Prettier and diff-check passed. ESLint has zero errors; its 22 warnings are pre-existing and outside the Task 3.1 candidate files.

OpenSpec strict validation passed: `16 passed / 0 failed`.

## Candidate Binding

```text
4869108087649de1d841db862570e659d5f22e159fe8eef9012715cee5b2429b  microservices/balance-component/src/service/makerExcessSubmitService.ts
dab543a83455f20b958681b5b2c5f340ba8c81a531db98bbd2a29669e7912004  microservices/balance-component/test/unit/service/makerExcessSubmitService.test.ts
```

## Review

- Trade Finance BA: PASS, no P0／P1／P2. The concurrency controls do not reinterpret V4／BD behavior; final unconditional currency-invariant placement matches the approved Delta Spec.
- Independent 4-Eyes: initially `REQUIRES_CHANGE` for missing facts-version fencing, transactional idempotency and the BD-03 currency-invariant bypass; all findings corrected; final PASS with no P0／P1／P2.
- Independent QA: initially `REQUIRES_CHANGE` for missing conflict and exact-scope evidence; all findings corrected; fresh focused `17／17` PASS with no P0／P1／P2.

## Open Quality-Gate Item

The existing dependency audit blocker remains unchanged: `4 vulnerabilities` (`1 high`, `3 moderate`). Task 3.1 adds no dependency. This remains an explicit release security-gate blocker and is not represented as PASS.
