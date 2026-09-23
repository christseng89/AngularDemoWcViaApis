# Task 3.5 TDD Evidence — Checker FX Fail-Closed Audit

Date: 2026-09-23  
Branch: `OVERDRAWN`  
Base HEAD: `fdbe5f25689d077bec5e602248ad8f56333b477c`

## Approved behavior proved

- `FX_RATE_UNAVAILABLE` and `FX_RATE_STALE` deny Checker Release.
- The existing movement remains `PENDING`; its Pending Excess Reservation, Maker FX snapshot, Maker decision snapshot and Maker idempotency fact remain byte-equivalent.
- The only new fact is a separate append-only `CHECKER_RELEASE` command-attempt audit. No Checker FX snapshot, decision snapshot, reservation event or workflow state is created.
- The audit records movement／owner identity, Checker actor, idempotency key and canonical request hash, error code, policy version, exact USD→owner `BOOKING` request, decision time and creation time.
- `FX_RATE_PENDING` is not a legal result or workflow state.
- Maker／Checker separation and `PENDING → RELEASE` lifecycle eligibility are checked before FX and before audit persistence. Invalid actor or non-pending movement produces zero FX calls and zero attempt audits.
- Same scope／key／request replays the first audited failure; changed request returns `IDEMPOTENCY_CONFLICT`; a different key performs a new revaluation and appends a distinct audit.

## RED evidence

1. The first unavailable／stale tests failed with `no such table: excess_command_attempt_audits`, proving the tests preceded schema and persistence implementation.
2. Cleanup tests then failed because the new child audit rows prevented movement deletion, proving cleanup-all and cleanup-by-LC had not yet incorporated the new fact.
3. Idempotency hardening failed because the second same-key attempt returned a newly observed `FX_RATE_STALE` while the unique audit retained the first `FX_RATE_UNAVAILABLE`.
4. Authorization/lifecycle tests failed because same-Maker and `REJECTED` movement attempts reached FX revaluation instead of rejecting pre-FX.
5. The first full GREEN run reached 58／58 suites and 1120 tests, but branch coverage was 94.93%, below the 95% gate. Concurrent same-scope conflict and defensive missing-row tests were added rather than excluding code from coverage.

## GREEN / REFACTOR

- Migration 32 and the fresh schema create `excess_command_attempt_audits` with bounded command／result／currency-purpose values, movement FK, unique command identity, canonical request hash and immutable UPDATE／DELETE triggers.
- `ExcessCommandAttemptAuditStore` performs explicit MISS／REPLAY／CONFLICT resolution and targeted conflict handling; it never silently returns a result inconsistent with the persisted audit.
- `BalanceService.revalueA3ExcessByChecker` applies 4-Eyes and pending-state guards before idempotency preflight and FX. Its exported public result excludes internal audit context.
- The read-only release policy returns internal immutable audit context only for typed FX failures; `BalanceService` persists that context and exposes the stable public code.
- Cleanup-all and cleanup-by-LC remove command-attempt audit children before movements; rollback restores data and immutable triggers.
- Injected audit-write failure propagates while leaving movement and reservation unchanged.

## Verification

- Focused Task 3.5 suites: **4 suites / 60 tests PASS** before final hardening; targeted hardening suites also PASS.
- Balance microservice full suite: **58 suites / 1122 tests PASS**.
- Coverage: **Statements 97.69% / Branches 95.02% / Functions 99.05% / Lines 98.51%**.
- `npm run typecheck`: PASS.
- `npm run lint -- --quiet`: PASS.
- `npm run build`: PASS.
- Scoped Prettier check for every Task 3.5 touched source／test file: PASS. The repository-wide check still reports 47 pre-existing unrelated files.
- `openspec validate --all --strict --no-interactive`: **16 PASS / 0 FAIL**.
- `git diff --check`: PASS (line-ending notices only).

## Candidate file hashes (SHA-256)

```text
f6548c16964250a5373a5d9980bc1c12187c1d6482fe83f7e8849fd7f1de3e33  microservices/balance-component/src/db/schema.ts
f8296ecb59ca1fe4685de24dca2daacb0d3246197385ddb78201da027277d203  microservices/balance-component/src/db/migrations.ts
5ccd3c6e3347944169ccf871d19e42d1d278c0ffa65fbfe88cc6c6900a117714  microservices/balance-component/src/store/excessCommandAttemptAuditStore.ts
2701e38287239eed22433cca227bdf40cfe4d6a378f676b9e95e0e755244383e  microservices/balance-component/src/service/movementReleasePolicyService.ts
a650d6d5b384631f40c7e414c5062cd17598487692b113d1ee28c48c55c8e692  microservices/balance-component/src/service/balanceService.ts
b88d9066adabcc71c7aa1a9e19a90a4c11a5ed1c218c2668a8f41c989ed7c57e  microservices/balance-component/scripts/cleanup-excess-support.mjs
b6b1cc0551fc2227e02d7e4b2e1692f6ee3e67f67e89788458d9d90f2c53f61a  microservices/balance-component/test/unit/service/balanceServiceMakerExcess.test.ts
c32375627b0e12b49b1e06f06f8443b001886c3d6ba4f5601d17088fcaa4cdc8  microservices/balance-component/test/unit/service/movementReleasePolicyService.test.ts
fea0bbc9bc54605039c6e8d758a047fff9bb8b861c3ec2f059856b51171852f6  microservices/balance-component/test/unit/store/excessStores.test.ts
dc4fe3f77318d0887a0012fb572f7549390e52312b15ff9ee2b097ab34872eb4  microservices/balance-component/test/unit/db/excessSchema.test.ts
99b45ef349b42aa7d6fed4a5a36e952fd2233c584e07c8ed4a826ac6f07c81cc  microservices/balance-component/test/unit/db/cleanupScripts.test.ts
```

## Review status

- Trade Finance BA: **PASS**; no new Business Decision or V4 semantic drift.
- Independent 4-Eyes: **PASS** after all initial P1/P2 findings were remediated; no remaining P0–P3 finding.
- Independent QA: **PASS**; independently re-ran 5 suites／71 focused tests and the complete 58-suite／1122-test regression, verified coverage and all recorded hashes.
