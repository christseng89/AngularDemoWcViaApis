# Task 3.3a TDD Evidence — Four-function Over-limit Zero-write

Date: 2026-09-23  
Branch: `OVERDRAWN`

## Approved Contract

- Revised BD-06 supersedes the former HTTP 201／persisted `LIMIT_EXCEEDED／BLOCKED` behavior.
- A8／A3／A3S／B3 initial Maker Submit with projected Excess above Effective Limit returns HTTP `409`／`EXCESS_LIMIT_EXCEEDED`.
- The rejected command creates no movement、Excess account、Pending Excess Reservation、FX／decision snapshot、ledger event、audit-as-transaction fact or idempotent success.
- Fix／Resubmit over-limit replacement preserves the original accepted pending facts; that later path remains tracked by Task 3.7.

## RED

Command:

```text
npx jest --runInBand --runTestsByPath test/unit/service/makerExcessSubmitService.test.ts test/unit/service/balanceServiceMakerExcess.test.ts
```

Observed expected failure before implementation:

- Existing service returned HTTP `201` with `PENDING／LIMIT_EXCEEDED／EXCESS_LIMIT_EXCEEDED／BLOCKED`.
- SQLite integration showed the old pending movement／reservation persistence instead of the required HTTP 409 zero-write result.
- Result: 2 suites failed; the principal contract assertion showed expected HTTP 409 but received HTTP 201 persisted blocked facts.

## GREEN Implementation

- `MakerExcessSubmitService` exposes a typed HTTP `409 EXCESS_LIMIT_EXCEEDED` command result.
- Accepted persistence types now permit only `WITHIN_ALLOWANCE／ELIGIBLE`; a persisted `LIMIT_EXCEEDED／BLOCKED` Maker result is no longer representable through this service.
- Allowance evaluation remains inside `BEGIN IMMEDIATE`. An internal limit signal exits by exception so SQLite rolls back the owner account that `lockAllowance` may have created before returning the typed command result.
- Parameterized orchestration and real SQLite tests cover A8、A3、A3S and B3 with the same rejection contract, including zero `excess_command_attempt_audits` and zero SG-capacity facts.
- A deterministic in-flight last-slot regression uses two independent connections to the same file-backed SQLite database. Both commands pass preflight/current-facts and wait at a shared FX barrier before either enters its unit of work; after release, exactly one persists and the other returns HTTP 409 with no second movement、reservation、snapshot、ledger or idempotency row.
- The HTTP route／API layer now covers A8／A3／A3S／B3 with typed `409 EXCESS_LIMIT_EXCEEDED` and zero-write assertions. Task 3.3a is complete; OpenAPI documentation and Business Case Runner coverage remain separately tracked by Tasks 5.3 and 7.12.

## Verification

Focused after formatting:

```text
3 suites passed / 63 tests passed
```

Full Balance suite:

```text
58 suites passed / 1126 tests passed
Statements 97.70% / Branches 95.02% / Functions 99.05% / Lines 98.51%
```

Additional gates:

- `npm run typecheck` — PASS
- `npm run lint -- --quiet` — PASS
- `npm run build` — PASS
- scoped Prettier check — PASS
- `openspec validate --all --strict --no-interactive` — 16 PASS / 0 FAIL
- OpenSpec BA review — PASS, no new Business Decision
- OpenSpec independent 4-Eyes review — PASS, no P0／P1／P2 findings

## Candidate Hashes

```text
a4efb792d7b15bba7d73f647ee03bffc801f9c685fca34b4e84c06ccd500080d  microservices/balance-component/src/service/makerExcessSubmitService.ts
876071ff303707694c6fca8c102e78e348d9176f4ca6c925a1d576727ac416ef  microservices/balance-component/test/unit/service/makerExcessSubmitService.test.ts
aab288f1ac5d25eb95a17e6a22533989d8843efc471a3b5da696b3decdceb5d2  microservices/balance-component/test/unit/service/makerExcessSqliteUnitOfWork.test.ts
83c0c7365f0a6e6579b338889bf0e9baa9f0281c7a19de1b9c9315964cc1118c  microservices/balance-component/test/unit/service/balanceServiceMakerExcess.test.ts
```

## Review Status

- Implementation BA review: PASS for implemented service／SQLite slice; no new Business Decision
- Independent 4-Eyes code review: PASS; four-function HTTP closure was reviewed with Task 5.2.
- Independent QA verification: PASS; full regression now includes four-function HTTP zero-write coverage.
