# Batch 07 — Portal nested conditionals

Status: PASS locally and confirmed by Sonar rescan.

## Current scope

- `apps/ssi-portal/src/app/formly-types.ts`
- `apps/ssi-portal/src/app/maintenance-index-action-policy.ts`

Existing characterization already covered governed ADD/EDIT/INQUIRE presentation, ALL/MT/CBPR
message grouping, and ACTIVE/DRAFT/other maintenance-index tabs. The four nested ternaries were
replaced with direct guard clauses while preserving labels, option order, selection behavior,
column identity, and tab behavior.

## Sonar issues in scope

- `ad74c701-df7a-43e3-8b76-a9dc5c52609b` (`typescript:S3358`)
- `8d595896-9464-4147-a9bf-71c85db178e7` (`typescript:S3358`)
- `f9267329-31f3-4110-a2f9-72d15e09740c` (`typescript:S3358`)
- `6e6b4ae4-b72b-4da7-b56f-9c47d7fd62b8` (`typescript:S3358`)

## Evidence

- Focused characterization: 2 suites / 59 tests PASS.
- Full project CI tests: all 8 Nx projects PASS.
- ESLint: PASS.
- `ssi-portal:typecheck`: PASS.
- `formly-types.ts`: Statements 99.23%, Branches 93.33%, Functions 100%, Lines 99.11%.
- `maintenance-index-action-policy.ts`: Statements 94.44%, Branches 94.11%, Functions 96.15%, Lines 93.87%.

All four per-file metrics are strictly above 92%.

Sonar analysis `ce49b88c-249b-46cf-86b2-81973924b013` closed all four issues in scope.
Project code smells decreased from 53 to 49 and Major severity issues decreased from 16 to 12.
Overall coverage remains 91.1%, Portal coverage remains 85.6%, new-code coverage is 100.0%, and
duplicated-line density remains 0.9%.
