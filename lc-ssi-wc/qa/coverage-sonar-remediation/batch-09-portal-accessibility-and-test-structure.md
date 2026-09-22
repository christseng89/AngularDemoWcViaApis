# Batch 09 — Portal accessibility and test structure

Status: PASS locally and confirmed by Sonar rescan.

## Current scope

- `apps/ssi-portal/src/app/resolution-workbench/resolution-workbench.css`
- `apps/ssi-portal/src/app/swift-data-crud.component.html`
- `apps/ssi-portal/src/styles.css`
- `apps/ssi-portal/src/test/app/component-behavior.spec.ts`
- `apps/ssi-portal/src/test/app/design-system.styles.spec.ts`
- `apps/ssi-portal/src/test/app/settings-page.component.spec.ts`
- `apps/ssi-portal/src/test/app/swift-data-crud.component.spec.ts`
- `apps/ssi-service/src/test/app/page-parameters/resolution-page-scenario-catalogue.service.spec.ts`
- `apps/ssi-service/src/test/app/sqlite-repositories.spec.ts`

The duplicated `.sort-heading` declaration is consolidated without changing its computed
properties. The two live status regions use semantic `<output>` elements, and the existing block
layout is preserved. Repeated route characterization is parameterized, and three hooks are moved
within their existing suites without changing test logic, names, fixtures, or assertions.

## Sonar issues in scope

- `12f90133-9f44-413f-8bca-539daf6d6a58` (duplicate CSS selector).
- `c32a9fed-b58e-471d-a7ce-74bc5d79bd84` (semantic status output).
- `6c8407ea-5306-4b65-b1e4-61646b5f2ee6` (semantic status output).
- `25014972-4083-4546-ae4c-477ba0d829c6` (parameterized tests).
- `7dedf8f9-3bbb-4d21-ad87-fe4ce46eb9e4` (hook placement).
- `97c20009-32fb-4df7-a334-84eaef056c69` (hook placement).
- `2d3bc7c1-141f-48ad-99da-14c75ea26500` (hook placement).

## Evidence

- Red: two static characterization tests failed as expected: duplicate `.sort-heading` count was
  two, and the template still contained `role="status"`.
- Green static characterization: 2 suites / 24 tests PASS.
- Portal behavior/settings validation: 2 suites / 80 tests PASS.
- Service test-structure validation: 2 suites / 36 tests PASS.
- ESLint over all changed TypeScript test files: PASS.
- `ssi-portal:typecheck`: PASS.
- `ssi-service:typecheck`: PASS.
- Full project CI tests: all 8 Nx projects PASS.

No production TypeScript file is changed in this batch, so the four-metric per-file TypeScript
coverage gate is not applicable to this scope. Markup and stylesheet behavior is protected by the
new static characterization tests; no source file is excluded from coverage.

Sonar analysis `1ab6b84f-bccf-4f6d-8e45-8c28a979f243` closed all seven issue keys in scope.
Project code smells decreased from 48 to 41, and Major severity issues decreased from 11 to 4.
Overall coverage remains 91.2%, duplicated-line density remains 0.9%, and bugs and vulnerabilities
remain zero. The scanner returned a failed Quality Gate solely because overall coverage is still
below the configured 92% threshold; the analysis itself completed and was processed successfully.
