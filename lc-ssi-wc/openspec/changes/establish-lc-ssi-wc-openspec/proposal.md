## Why

The LC SSI Workbench has controlled governance, OpenAPI, typed Page Parameter contracts, governed data sources, implementation and extensive automated tests, but no OpenSpec root or capability baseline. Without OpenSpec, current observable behaviour and future changes cannot use a consistent spec-driven lifecycle, strict structural validation or requirement-level traceability.

## What Changes

- Establish a `spec-driven` OpenSpec root modelled on the LC Payment structure.
- Create evidence-backed current capability specifications for the implemented LC SSI Workbench.
- Add source/authority, discrepancy, risk/assumption and requirement traceability registers.
- Record this adoption as a process-only change with `skip_specs: true`; current baselines are not duplicated as delta specs.
- Define exact-commit Maker/Independent Checker review and strict validation controls.

## Capabilities

### Current Baselines Added

- `application-shell-and-accessibility`
- `resolution-page-contract`
- `generic-resolution-workbench`
- `settlement-route-discovery-and-resolution`
- `rma-authorisation-and-message-scope`
- `governed-reference-data-maintenance`
- `maker-checker-and-concurrency`
- `governed-index-querying`
- `development-data-reload`
- `checker-workbench`
- `audit-and-evidence`
- `mt-mx-and-reference-output-contract`

## Impact

- Documentation and governance only: `openspec/` and the associated implementation/design plans.
- No production code, API, OAS, parameter, database, fixture or UI behaviour changes.
- No data migration and no runtime deployment impact.
- Rollback is removal of the new OpenSpec and plan files from the task branch.

## Non-goals

- No claim that current OAS covers every implemented endpoint.
- No new SWIFT, MT/MX, SSI, RMA, settlement or maintenance rule.
- No promotion of governance mandates lacking implementation evidence into current product requirements.
- No access to or derivation from `qa-archived/`.
- No self-approval and no claim of formal human BA, QA, DBA or regulatory sign-off.
