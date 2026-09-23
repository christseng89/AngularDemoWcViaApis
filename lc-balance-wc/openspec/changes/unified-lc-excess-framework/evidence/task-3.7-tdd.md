# Task 3.7 TDD Evidence — Atomic Excess Fix Pending Replacement

## Scope

- A8／A3／B3 and pre-Acknowledge A3S Amount Fix reuse the original movement and business-event identity.
- The old outstanding reservation is released exactly once and replaced by the freshly recalculated reservation in the same SQLite transaction.
- Positive-policy Fix repeats current capacity、policy、Booking FX and allowance validation. Protected identity、reference、currency and linked fields are rejected.
- Post-Acknowledge A3S remains protected before policy／FX. Remarks-only continues through the existing correction path.

## RED

- The approved A3 examples `10200/200 -> 10300/300` and `10200/200 -> 10100/100` initially returned legacy `409 INSUFFICIENT_AVAILABLE_BALANCE`.
- The over-limit replacement initially returned the legacy error rather than typed `EXCESS_LIMIT_EXCEEDED`.
- Existing Fix Pending had no FX snapshot、Excess decision snapshot or reservation replacement transaction.

## GREEN

- Both normative examples preserve the movement id and produce ledger chains `PENDING 200 / RELEASE 200 / PENDING 300` and `PENDING 200 / RELEASE 200 / PENDING 100`.
- A8、B3 and pre-Acknowledge A3S use the same replacement boundary; A3S keeps its linked SG movement identity and validates the compound edit atomically.
- Over-limit and non-USD stale FX failures leave the original movement、reservation、snapshots and Fix audit unchanged.
- Same actor/key replay returns the first successful movement without duplicate reservation、FX／decision snapshot or Fix audit.
- An injected late `FIX_PENDING` FX-snapshot failure rolls back the movement edit、Fix audit、reservation events、snapshots and idempotency fact.
- Existing post-Acknowledge A3S `PENDING`／EARMARKED and `REJECTED` tests still return `409 ILLEGAL_STATE_TRANSITION` before policy／FX or mutation.

## Verification

- Focused Excess API suite: 1 suite／44 tests PASS.
- Full Balance microservice regression: 60 suites／1,198 tests PASS.
- TypeScript typecheck: PASS.
- ESLint `--quiet`: PASS.
- Build: PASS.
- `openspec validate --all --strict --no-interactive`: 16 PASS／0 FAIL.
