# Task 3.2 TDD Evidence — Owner Account Orchestration and Pending Reservation

Date: 2026-09-22  
Branch: `OVERDRAWN`

## RED

- The first public BalanceService test exposed that a committed same-key replay reached event-sequence collision before idempotency preflight.
- The first full regression run exposed that deferring all sufficiency results until after snapshot capture changed the established REVERSAL error contract.
- Independent 4-Eyes review rejected externally injected, constant `currentFacts`, the weaker existing-contract lookup, caller-supplied request hashes and the one-row-per-movement decision schema.
- Focused schema/service tests were added for lifecycle pre-FX rejection, facts-fingerprint change after FX, canonical payload conflict, append-only multiple decisions and final account-CAS rollback.
- Final 4-Eyes review exposed that linked SHGT facts used by Tight Available were absent from the post-FX fingerprint. A RED regression changed SG exposure during FX and reproduced an incorrect HTTP 201 persistence before the fingerprint was corrected.

## GREEN / REFACTOR

- `BalanceService` prepares one movement identity and exposes no caller bypass flag. Legacy `createMovement()` still throws the existing insufficiency error; the server-side A3 coordinator alone consumes the typed shortfall assessment.
- The public command performs `(commandType, ownerId, actorContext, key)` preflight using a server-derived canonical SHA-256 request hash. Exact replay returns the original response and identity; a changed payload returns `IDEMPOTENCY_CONFLICT`.
- A3 owner currency, transaction amount, Tight Available capacity, latest Checker-released face amount and the opaque facts fingerprint are derived from the same persisted contract/movement set as the prepared movement. The fingerprint is recomputed inside `BEGIN IMMEDIATE` after FX; amount and currency are checked again immediately before movement insert.
- The fingerprint also includes the authoritative linked SHGT movement fact set in stable movement-identity order. A linked SG Issue/Release during FX now causes facts-version mismatch and zero writes for the A3 movement, reservation, FX snapshot, decision and idempotency record.
- Existing contract resolution reuses the normal root-ISSUE, lifecycle, referenced-transaction and currency gates. CLOSED, unreleased, bad-reference and currency-mismatch cases stop before FX and write no Excess facts.
- Movement, owner account, Pending Excess Reservation, FX snapshot, decision snapshot, idempotency response and account CAS are one SQLite transaction. Decision and final account-CAS injected failures roll the whole package back.
- Decision snapshots now use a distinct snapshot identity plus `(movement, action, command key)` uniqueness, allowing immutable Maker, Fix, Resubmit and Checker decision history. Migration 31 preserves the earlier Maker row as read-only legacy evidence and permits later decisions for the same movement.
- BD-01 unavailable/stale FX is zero-write. BD-03 either-zero policy invokes unchanged legacy sufficiency with zero FX and zero Excess persistence.

## Verification

- Focused Task 3.2 and orchestration suites: PASS.
- Balance microservice full suite: **58 suites / 1097 tests PASS**.
- Coverage: **Statements 97.65% / Branches 95.03% / Functions 98.86% / Lines 98.50%**.
- `npm run typecheck`: PASS.
- `npm run lint -- --quiet`: PASS.
- `npm run build`: PASS.
- Changed new tests and Task 3.2 implementation files subject to the repository's existing format baseline: targeted Prettier check PASS for the newly added/modified conforming files; repository-wide `format:check` continues to report the pre-existing 51-file baseline.
- `openspec validate --all --strict --no-interactive`: **16 PASS / 0 FAIL**.
- `git diff --check`: PASS (line-ending notices only).

## Review

- Trade Finance BA: **PASS**; no new Business Decision and no semantic drift.
- Independent QA: **PASS**; focused 5 suites / 55 tests plus the full suite independently verified.
- Independent 4-Eyes: **PASS** after the linked-SG concurrency fingerprint finding was fixed and re-tested.
- Deferred, non-blocking concurrency stress for the legacy event-sequence/idempotency race remains explicitly assigned to Tasks 5.4 / 7.7.
