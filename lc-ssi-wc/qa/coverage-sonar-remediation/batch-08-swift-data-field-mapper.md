# Batch 08 — Swift data field mapper

Status: PASS locally and confirmed by Sonar rescan.

## Current scope

- `apps/ssi-portal/src/app/swift-data-feature/swift-data-field-mapper.ts`
- `apps/ssi-portal/src/test/app/swift-data-feature/swift-data-field-mapper.spec.ts`

Option-source selection is now delegated to a focused resolver for governed currency, governed
RMA message type, and static options. Conditional Formly expressions are built explicitly rather
than through conditional object spreads. Existing field order, labels, callbacks, validators,
payload conversion, nested-path behavior, and API semantics remain unchanged.

## Sonar issue in scope

- `26d34d1f-c1bb-42a4-bbaf-ad98fd3e6f78` (`typescript:S3358`).

## Evidence

- Characterization covers all three option sources, required/disabled conditions, ADD/EDIT mode,
  governed message validation, scalar/array form conversion, and nested object replacement.
- Focused test: 3/3 PASS.
- Full project CI tests: all 8 Nx projects PASS.
- ESLint: PASS.
- `ssi-portal:typecheck`: PASS.
- `swift-data-field-mapper.ts`: Statements 100%, Branches 100%, Functions 100%, Lines 100%.

All four per-file metrics are strictly above 92%.

Sonar analysis `14db2ce0-1b2a-4910-8446-9b663d9352e2` closed issue
`26d34d1f-c1bb-42a4-bbaf-ad98fd3e6f78`. Project code smells decreased from 49 to 48,
Major severity issues decreased from 12 to 11, Portal coverage increased from 85.6% to 85.7%,
and overall coverage increased from 91.1% to 91.2%. New-code coverage is 100.0% and
duplicated-line density remains 0.9%.
