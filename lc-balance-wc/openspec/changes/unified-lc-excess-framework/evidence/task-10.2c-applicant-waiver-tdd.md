# Task 10.2c — Applicant Waiver Backend TDD（SUPERSEDED）

Date: 2026-09-23

RED reproduced an A3S/A4 final Release succeeding without Applicant Waiver confirmation.

GREEN implementation:

- Release accepts `applicantWaiverValidationResult` and optional opaque reference/date/evidence.
- Historical result only. The 2026-09-24 BUG decision supersedes this gate: A4／A6 now follow B4's ABSENT Checker approval operation and do not require or persist Applicant Waiver.
- Successful A4/A6 persists an append-only `applicant_waiver_snapshots` fact in the same transaction as locked reservation conversion.
- Covered-only and Export B3 paths do not invoke the waiver gate.
- OAS, maintenance cleanup and Angular API client contract were synchronized.

Focused verification:

- Microservice API/schema/cleanup: 3 suites PASS, 76 tests PASS, 3 scope-excluded tests skipped.
- Microservice typecheck and lint: PASS.
- Angular API client spec: 48 tests PASS (focused command's aggregate coverage threshold is expected to require the full suite).
- OpenSpec strict validation: 16 PASS / 0 FAIL.
