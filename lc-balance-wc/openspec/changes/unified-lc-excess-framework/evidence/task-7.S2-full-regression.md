# Task 7.S2 — Full Regression and Real-service Runner Gate

Date: 2026-09-23  
Branch: `OVERDRAWN`

## Covered-only A3S regression

The first real-service Run All exposed that an A3S command with no Maker Excess decision used the
plain legacy A3 acknowledge shortcut. The LC arrival was acknowledged, but its linked SG redemption
remained Pending and its Eligible SG Capacity reservation remained open.

TDD added HTTP proof that covered-only A3S Acknowledge atomically releases the unique same-owner SG,
converts `INITIALIZE -> RESERVE -> REDEEM`, retains the LC UTILIZE as acknowledged Pending, creates no
FX／Excess facts, replays the same key without duplicate effects, and rolls every mutation back if the
late Checker-Acknowledge idempotency insert fails. Plain legacy A3 remains acknowledge-only with zero
SG capacity side effects.

Focused validation:

```text
2 suites PASS; 3 selected tests PASS
microservice typecheck PASS
microservice lint PASS
```

## Full automated gates

```text
Angular
70/70 suites, 2043/2043 tests PASS
Coverage: Statements 98.06%, Branches 95.13%, Functions 96.83%, Lines 98.58%
Typecheck PASS; lint PASS

Balance microservice
63/63 suites, 1247/1247 tests PASS
Coverage: Statements 94.79%, Branches 91.28%, Functions 98.65%, Lines 97.19%
Typecheck PASS; lint PASS

Runner backend
3/3 suites, 71/71 tests PASS
Coverage: Statements 98.12%, Branches 95.71%, Functions 100%, Lines 99.59%
Lint PASS

Virtual Currency Exchange
1/1 focused suite, 44/44 BOOKING／midpoint／freshness boundary tests PASS
```

The microservice Jest configuration still contains a historical 95% per-metric global threshold, so
the coverage command exits non-zero for Statements 94.79% and Branches 91.28% even though all 1,247
tests pass. No threshold was lowered or bypassed. The approved release Quality Gate is the separate
Task 8.S2 SonarQube scan with the accepted 92% Coverage conditions.

## Real-service Business Case Runner

An isolated current-branch stack used Balance service `:4110`, Runner backend `:4310`, a fresh
`task-7s2.sqlite`, and the non-production virtual FX adapter `:3001`.

```text
Single case: overdrawn-a2-b2-remediation PASS (26 trace steps)
Run All: 42 total / 42 PASS / 0 FAIL
```

Run All includes the complete A1–A11／B1–B7 characterization set, five OVERDRAWN journeys, the
A3／A8／A3S／B3 Runner-only A02／B02 remediation trace, and all manual-readiness fixtures.

