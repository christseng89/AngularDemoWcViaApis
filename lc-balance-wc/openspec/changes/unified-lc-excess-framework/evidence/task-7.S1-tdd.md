# Task 7.S1 — Simplified OVERDRAWN Business Case Runner Matrix

Date: 2026-09-23  
Branch: `OVERDRAWN`

## Scope and reuse boundary

The demo runner adds only five deterministic end-to-end journeys and reuses the already-approved
parameterized microservice tests for destructive／failure permutations. This avoids duplicating the
same Cartesian matrix in the UI runner while retaining executable proof for every Task 7.S1 rule.
Live execution against the real Balance service and virtual FX adapter belongs to Task 7.S2.

## RED

- Registry tests initially expected 37 cases and did not recognize the `OD-*` natural keys.
- The Runner issued mutation calls without `Idempotency-Key`.
- A compact Maker Excess success response had no `balanceContractId`, so a dependent A9／B4 step
  failed before dispatch with `Step references ... but that step never produced one`.

## GREEN implementation

- Added five named journeys to `backend/data/businessCases.js`:
  - `overdrawn-a8-a9`: A8 partial Excess and A9 preservation.
  - `overdrawn-a3-a4`: USD_PAR path, A3 partial Excess and A4 final Release.
  - `overdrawn-a3s-anti-double-counting`: A8 selected SG capacity plus only the remaining A3S
    parent Excess, with once-only Acknowledge attribution.
  - `overdrawn-b3-b4`: B3 partial Excess and B4 preservation.
  - `overdrawn-a2-b2-remediation`: A3／A8／A3S／B3 over-limit zero-write rejection, Runner-only
    automatic Checker-released A02／B02 using finite Minimum Required Increase, then a fresh Submit;
    A3S retries the entire two-leg compound command.
- Runner auto-remediation is triggered only by `EXCESS_LIMIT_EXCEEDED`; a negative Tight snapshot or
  any other rejection never creates A02／B02. Production UI／API behavior remains zero-write guidance.
- Every non-GET runner call now carries a fresh `Idempotency-Key`.
- The Runner hydrates only its private captured／trace response from the authoritative natural-key
  lookup when the approved compact Maker response omits `balanceContractId`; the service response
  and production API contract are not changed.
- Existing lifecycle cases retain Covered-only／exact routes and A6; existing parameterized
  microservice suites remain the authoritative executable matrix for FX unavailable／stale,
  production no-midpoint, BD-03 zero policy, whole Delete only, replay／conflict and concurrency.

## Requirement-to-proof map

| Requirement | Executable proof |
|---|---|
| A8／A3／A3S／B3 partial Excess | Five `OVERDRAWN` registry journeys plus `backend/test/businessCases.test.js` |
| Covered／exact／one-minor-unit-over arithmetic | Existing `domain/excessPolicy.test.ts` and Maker Excess API matrix |
| Runner-only A02／B02 Increase then fresh Submit | `overdrawn-a2-b2-remediation`, `backend/test/runCase.test.js` plus Task 3.9 production-boundary tests |
| A8→A3S anti-double-counting | `overdrawn-a3s-anti-double-counting` plus Task 4.2–4.6 tests |
| A4／A6／B4／A9 preserve Approved Excess | New A4／B4／A9 journeys, existing A6 lifecycle, Task 4.6 tests |
| Virtual midpoint only outside production; provider BOOKING／Freshness fail closed | Existing `currencyExchange*.test.ts`, virtual-provider tests and Tasks 2.6a／2.7／2.8 evidence |
| BD-03 zero-value legacy route | Parameterized Maker Excess HTTP matrix and Task 3.11 evidence |
| Whole Delete only; no Return／partial cancellation | Maker Excess Delete matrix and Tasks 2.4／3.8／3.10 evidence |
| Idempotency／payload conflict／owner concurrency | Maker Excess API／service matrices and Task 3.3a／5.S2 evidence |

## Validation

```text
backend> npm test -- --runInBand --silent
Test Suites: 3 passed, 3 total
Tests:       71 passed, 71 total
Coverage:    Statements 98.12%, Branches 95.71%, Functions 100%, Lines 99.59%

backend> npm run lint -- --quiet
PASS (0 errors, 0 warnings)
```

Real-service proof for `overdrawn-a2-b2-remediation` on isolated Runner `:4310` and Balance service
`:4110` passed all four flows on 2026-09-23: each A3／A8／A3S／B3 initial command returned the expected
HTTP 409, its Runner-only A02／B02 create and Release returned 201／200, and its fresh retry returned
201. Full Run All remains the Task 7.S2 release gate.
