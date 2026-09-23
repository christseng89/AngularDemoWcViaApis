# Task 3.3 TDD Evidence — Failure Atomicity and Calculable Over-limit（Superseded Contract）

> Historical evidence only. The HTTP 201／persisted blocked-over-limit behavior below was superseded by user-approved BD-06 revision on 2026-09-23. Remediation and replacement RED／GREEN evidence are tracked by Task 3.3a; this file MUST NOT be used as current acceptance evidence.

Date: 2026-09-22  
Branch: `OVERDRAWN`

## Test-first proof

- Public `BalanceService` integration tests cover `FX_RATE_UNAVAILABLE`, `FX_RATE_STALE`, configuration resolution failure and pre-domain identity, lifecycle, reference, currency, instrument-type and root-Release failures.
- SQLite failure injection covers movement/store failure, decision/audit snapshot failure and final Excess account CAS failure.
- Contract and linked-SHGT facts are mutated during FX to prove post-FX fingerprint revalidation prevents stale persistence.
- A dedicated calculable over-limit case verifies the result is an accepted pending workflow fact, not an FX or technical error.

## Verified contracts

- Every FX, configuration or pre-domain failure creates zero A3 movement, Excess account/reservation, FX snapshot, decision snapshot and idempotent success.
- Store, audit and final CAS failures roll back the complete atomic set. A same-key retry succeeds after the injected late audit failure is removed.
- A calculable Excess of 20 against an Effective Limit of 10 returns HTTP `201 Created` and persists:
  - movement `status=PENDING`;
  - ledger `event_type=PENDING_RESERVATION`, transaction 120, Covered 100, Excess 20;
  - `excessDecision=LIMIT_EXCEEDED`;
  - `businessResultCode=EXCESS_LIMIT_EXCEEDED`;
  - `releaseEligibility=BLOCKED`;
  - one FX snapshot and one idempotent success response.
- BD-01 technical fail-closed, BD-03 legacy routing and BD-06 submit-and-block remain distinct.

## Verification

- Focused Task 3.3 review suite: **3 suites / 45 tests PASS**.
- Balance microservice full suite: **58 suites / 1099 tests PASS**.
- Coverage: **Statements 97.65% / Branches 95.03% / Functions 98.86% / Lines 98.50%**.
- `npm run typecheck`: PASS.
- `npm run lint -- --quiet`: PASS.
- `npm run build`: PASS.
- `openspec validate --all --strict --no-interactive`: **16 PASS / 0 FAIL**.

## Review

- Trade Finance BA: **PASS**; no new Business Decision.
- Independent 4-Eyes: **PASS**; no Task 3.3 blocker.
- Independent QA: **PASS**; focused 3 suites / 45 tests independently verified.
