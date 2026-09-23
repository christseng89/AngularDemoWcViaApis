# Tasks 10.2–10.5 Release-Candidate Evidence

Date: 2026-09-23  
Branch: `OVERDRAWN` (`main` was not modified)

## TDD and functional regression

- A6／A7 locked-attribution integration: 5／5 PASS. A6 rejects Legal amount mismatch before writes; the accepted Legal `10,200` retains Covered `10,000`／Excess `200`; A7 partial then full settlement changes only Legal Outstanding.
- B4 focused API／service／OAS: 75 PASS, with 3 superseded A8／A9 scope tests still skipped pending Task 10.1 deletion.
- Balance microservice full behavior regression: 67 suites, 1,283 PASS, 0 FAIL, 3 skipped.
- Angular full regression: 70 suites, 2,050 PASS, 0 FAIL; Statements 98.21%、Branches 95.04%、Functions 96.97%、Lines 98.68%。
- Business Case Runner backend: 3 suites, 80 PASS, 0 FAIL; Statements 98.01%、Branches 95.78%、Functions 100%、Lines 99.27%。
- Angular production build: PASS. Existing bundle-size warnings remain non-blocking.

## Contract validation

- `openspec validate --all --strict --no-interactive`: 16 PASS／0 FAIL.
- OpenAPI YAML parses and includes Applicant Waiver, B4 authorization, typed authorization snapshot and Covered／`EXPORT_EXCESS_ASSET` posting receipts.
- Active Excess API scope is A3／A3S／B3; A8／A9 remain on the main flow and outside this Change.

## ARM64 SonarQube

- Runtime: Linux ARM64 scanner against local SonarQube Community Build 26.9.
- Fresh LCOV inputs: Angular、backend、Balance microservice.
- Coverage: 94.9% — PASS against 92%.
- Duplicated Lines: 0.8% — PASS against 3%.
- First whole-project baseline Quality Gate: FAIL because pre-existing and current issues are counted together (High 27、Medium 111、Security 3、Maintainability 211). No threshold was reduced and no rule／file exclusion or bulk issue acceptance was used. Remediation is in progress under Task 10.5.

