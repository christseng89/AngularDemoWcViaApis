# Task 3.4 TDD Evidence — Checker Release Revaluation

Date: 2026-09-22  
Branch: `OVERDRAWN`

## RED findings

- A real SQLite revaluation initially counted the candidate A3 pending movement as another pending decrease, reducing Tight Available to zero and overstating Excess as the full transaction amount.
- 4-Eyes found the first BD-03 implementation required an Excess account before choosing the legacy route, although a BD-03 Maker submit intentionally creates no account.
- 4-Eyes also found that current capacity can legitimately improve to fully covered, so Checker revaluation must return `NOT_REQUIRED / ELIGIBLE` rather than throw.
- Final review found the transaction-currency-to-owner-currency invariant had to run before BD-03 routing, not only inside positive-policy Excess facts.

## GREEN / REFACTOR

- `MovementReleasePolicyService` now performs a read-only Checker revaluation that reloads movement, contract, authoritative linked facts, effective policy, latest qualified Booking quote and allowance on every attempt.
- Owner identity and the unconditional currency invariant are resolved before policy routing. Either-zero policy returns `LEGACY_RELEASE` without requiring an Excess account, FX call or allowance lookup.
- Positive-policy A3 revaluation excludes the candidate pending movement and its reservation exactly once, while retaining every other pending reservation, Approved utilization and linked SG fact.
- Non-USD requests use a new USD→owner `BOOKING` request with Checker decision time; USD uses `USD_PAR` without a provider call.
- `FX_RATE_UNAVAILABLE` and `FX_RATE_STALE` remain typed read-only results. Persistence/audit behavior is deferred to Task 3.5.
- Revaluation may produce `NOT_REQUIRED`, `WITHIN_ALLOWANCE` or `LIMIT_EXCEEDED`; no movement status or ledger conversion occurs in Task 3.4.

## Regression evidence

- A released SG redemption between Maker and Checker changes the authoritative split and is observed by Checker.
- Effective policy and provider quote changes between Maker and Checker are re-read; the Maker quote is not reused.
- A fully covered improvement returns `NOT_REQUIRED`, `businessResultCode=null`, `releaseEligibility=ELIGIBLE` while the movement remains `PENDING` and the original reservation/Maker snapshots remain unchanged.
- Real SQLite BD-03 succeeds without an Excess account; a persisted currency mismatch is rejected before FX with zero Excess writes.
- Allowance aggregation excluding the candidate movement preserves other pending and approved amounts.

## Verification

- Focused Task 3.4 suites: **3 suites / 50 tests PASS**.
- Balance microservice full suite: **58 suites / 1113 tests PASS**.
- Coverage: **Statements 97.70% / Branches 95.03% / Functions 99.04% / Lines 98.49%**.
- `npm run typecheck`: PASS.
- `npm run lint -- --quiet`: PASS.
- `npm run build`: PASS.
- `openspec validate --all --strict --no-interactive`: **16 PASS / 0 FAIL**.
- `git diff --check`: PASS (line-ending notices only).

## Review

- Trade Finance BA: **PASS**; no new Business Decision.
- Independent 4-Eyes: **PASS** after three P1 findings were fixed and re-tested.
- Independent QA: **PASS**; focused real-SQLite and policy tests independently verified.
