# Task 3.8 TDD Evidence — Reject and Whole Delete Pending

## Approved behavior proved

- A8／A3／A3S／B3 Reject changes the movement to `REJECTED` while retaining the complete Pending Excess Reservation and immutable Checker rejection facts.
- Whole Delete Pending accepts only `PENDING`／`REJECTED`. The product's persisted `CANCELLED` movement status is the existing storage mapping of the approved Excess workflow `DELETED` state.
- Movement deletion、the complete matching `RESERVATION_RELEASE`、allowance-account version advance、deletion audit and idempotent response commit in one SQLite unit of work.
- A rejected movement retains its Checker actor、timestamp、reason and remarks; the distinct deletion reason and remarks are retained in `delete_pending_audit`.
- Released／Approved movements remain terminal and Delete Pending never reduces or reverses `APPROVED_UTILIZATION`.
- Post-Acknowledge A3S remains eligible for BD-07 whole Delete Pending. Its linked SG once-only release facts remain unchanged; only the LC movement's Pending Excess Reservation is released.
- Excess Delete Pending requires `Idempotency-Key`. Same actor／key／canonical payload replays the original response without duplicate reservation release or deletion audit; a changed payload returns `IDEMPOTENCY_CONFLICT`.

## RED evidence

1. The initial focused run failed three new cases: PENDING and REJECTED Delete left the reservation outstanding, and an injected deletion-audit failure left the movement `CANCELLED` instead of rolling back.
2. The first full regression exposed two obsolete pre-BD-07 cases that still required acknowledged A3／A3S Delete Pending to return 409. They were replaced by the approved whole-delete success contract.
3. Independent 4-Eyes found the approved TC-06 Delete idempotency contract was missing.
4. Independent QA found the true-compound A3S Acknowledge→Reject→Delete path lacked direct proof.

## GREEN / REFACTOR

- `ExcessLedgerStore.listOutstandingReservationsByMovement` resolves the active reservation by immutable source-event pairing, so historical Fix Pending reservation/release pairs cannot be released twice.
- `BalanceService.cancelWithinTransaction` applies movement deletion, deletion audit, exact reservation release, account versioning and existing cancellation side effects atomically.
- `BalanceService.deletePendingExcessByMaker` performs canonical preflight and in-transaction replay/conflict checks, then persists the successful response in the same transaction.
- HTTP routing requires the idempotency key whenever immutable Excess ledger facts identify the Delete Pending context, including retry after deletion.
- Injected late audit failure proves complete rollback of movement status, reservation ledger and deletion audit.

## Verification

- Focused Excess API: **1 suite / 52 tests PASS**.
- Focused Excess API plus core Balance service: **2 suites / 178 tests PASS**.
- Full Balance microservice regression: **60 suites / 1,206 tests PASS**.
- TypeScript typecheck: **PASS**.
- ESLint `--quiet`: **PASS**.
- Build: **PASS**.
- `openspec validate --all --strict --no-interactive`: **16 PASS / 0 FAIL**.
- Independent 4-Eyes: **PASS** after Delete idempotency remediation.
- Independent QA: **PASS** after true-compound A3S Reject coverage was added.
