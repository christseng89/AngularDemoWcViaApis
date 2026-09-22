# Coverage and Sonar Remediation Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use tdd-orchestrator to implement this plan task-by-task.

**Goal:** Make every instrumented production TypeScript file strictly exceed 92% for statements, branches, functions, and lines while resolving evidence-backed SonarQube issues without changing behavior or manipulating quality metrics.

**Architecture:** Work in small evidence-ranked batches that combine coverage gaps, Sonar severity, cognitive complexity, and dispatcher responsibility. Characterization tests lock current behavior before focused handlers, services, helpers, and guard clauses reduce complexity; each batch is independently verified and rescanned before the next begins.

**Tech Stack:** Nx 23, Jest 30, TypeScript 6, Angular 22, NestJS 11, local SonarQube Community Build 26.9.

---

## Locked requirements

- Every production file must have statements, branches, functions, and lines strictly greater than 92%; workspace averages do not substitute for file results.
- Do not exclude production files, lower thresholds, ignore branches, delete valid tests, weaken assertions, or change test semantics.
- Fix Sonar issues in code or tests. A False Positive requires an individual written rationale and independent review; never bulk-accept issues.
- Routers and event handlers are thin dispatchers: identify the event, parse only necessary parameters, and dispatch to a focused handler/service/helper.
- Refactoring must improve responsibility, readability, or testability; do not mechanically split functions only to lower a metric.
- Preserve business behavior, API/OAS contracts, UI behavior, data semantics, performance, and security boundaries.
- Each batch records changed files, Sonar issues, before/after complexity, per-file coverage, and lint/typecheck/test results under ignored `tmp/coverage-sonar-remediation/`.
- Final delivery requires a new exact candidate commit, Independent Checker review of that same SHA, local fast-forward merge to `main`, and no push.

## Confirmed baseline

- Candidate branch before remediation: `unit-test` at `0b05c94e3165c3ae163328f2e0ab6b06545dacf4`.
- `main`: `85427982823c2d7ee6fbfcef71db25236a43b556`.
- Workspace coverage: statements 91.03%, branches 84.56%, functions 91.49%, lines 92.39%.
- SonarQube new code: coverage 80.4%, duplication 1.12%, 70 open/confirmed issues.
- Sonar severity: 12 High, 33 Medium, 25 Low; quality gate failed on new issues.
- Test migration: 193 files, 193 suites, 2,054 cases, 0 skipped, no orphan tests.

## Decision log

1. Use risk-and-evidence combined ranking instead of coverage-first or Sonar-first sequencing to avoid modifying and retesting the same file twice.
2. Characterization tests precede any refactor of existing complex logic.
3. A batch cannot pass while any touched production file has an applicable coverage metric at or below 92%.
4. High-severity reliability and maintainability findings are handled before lower-severity style findings.
5. Sonar is rescanned after every coherent batch; a clean local test result alone does not close a Sonar issue.
6. Existing business contracts and observable behavior are invariants, not refactoring opportunities.

## Task 1: Establish a reproducible baseline and ranking

**Files:**

- Modify: `scripts/verify-coverage-threshold.mjs`
- Modify: `scripts/verify-coverage-threshold.test.mjs`
- Create transient evidence: `tmp/coverage-sonar-remediation/baseline/`

1. Add a failing verifier test for deterministic machine-readable per-file results and production-only enforcement.
2. Run `node --test scripts/verify-coverage-threshold.test.mjs` and retain RED evidence.
3. Add the minimum report output needed for deterministic batch evidence without changing coverage collection or exclusions.
4. Run the verifier tests and full uncached Jest coverage.
5. Capture the ranked list using coverage deficit, Sonar severity, cognitive complexity, and dispatcher responsibility.
6. Record the current 70 Sonar issues and Quality Gate measures from the authenticated local server.

## Task 2: Batch 1 — High-severity dispatcher and reliability findings

**Primary production files:**

- `apps/ssi-portal/src/app/app.component.ts`
- `apps/ssi-portal/src/app/ssi-maintenance-feature/ssi-maker-fields.ts`
- `apps/ssi-service/src/app/development-data-reload.service.ts`
- `libs/parameter-engine/src/lib/rma-supported-message-type-catalogue.ts`

**Tests:**

- `apps/ssi-portal/src/test/app/app-shell.component.spec.ts`
- `apps/ssi-portal/src/test/app/app-shell-integration.spec.ts`
- `apps/ssi-portal/src/test/app/ssi-maintenance-feature/ssi-maker-fields.spec.ts`
- `apps/ssi-service/src/test/app/development-data-reload.service.spec.ts`
- `libs/parameter-engine/src/test/lib/rma-supported-message-type-catalogue.spec.ts`

1. Add characterization tests for event dispatch, state transitions, reload behavior, and catalogue ordering.
2. Run targeted tests and retain RED evidence for missing boundary behavior or architectural assertions.
3. Extract focused handler/service/helper responsibilities and use guard clauses where they improve flow.
4. Fix reliability findings without changing externally visible behavior.
5. Run targeted lint, typecheck, tests, and per-file coverage until all touched production files are strictly above 92%.
6. Rescan Sonar and record issue/complexity deltas.

## Task 3: Batch 2 — High-severity service complexity

**Production files:**

- `apps/ssi-service/src/app/entity/entity-application.service.ts`
- `apps/ssi-service/src/app/nostro/nostro-application.service.ts`
- `apps/ssi-service/src/app/page-parameters/payment-resolution-page-definition.source.ts`
- `apps/ssi-service/src/app/resolution-currency-discovery.ts`
- `apps/ssi-service/src/app/rma/rma-application.service.ts`
- `apps/ssi-service/src/app/ssi-application.service.ts`

**Tests:** existing mirrored specifications below `apps/ssi-service/src/test/app/`.

For each file independently: add characterization tests, demonstrate RED, introduce domain-focused helpers/guard clauses, restore GREEN, exceed all four per-file metrics, run project gates, and rescan Sonar before continuing.

## Task 4: Batch 3 — Remaining production Sonar findings

**Primary areas:**

- `apps/ssi-bff/src/main.ts`
- `apps/ssi-portal/src/app/formly-types.ts`
- `apps/ssi-portal/src/app/maintenance-index-action-policy.ts`
- `apps/ssi-portal/src/app/swift-data-crud.component.ts`
- `apps/ssi-portal/src/app/swift-data-crud.component.html`
- `apps/ssi-portal/src/app/swift-data-feature/`
- `apps/ssi-service/src/app/page-parameters/`
- `apps/ssi-service/src/app/rma/`
- `apps/ssi-service/src/app/shared/`
- `apps/ssi-service/src/app/sqlite-ssi.repository.ts`

1. Group findings by file and rule without mixing unrelated behavior.
2. Lock behavior with tests before production edits.
3. Replace nested ternaries, ambiguous coercion, unsafe/default-dependent sorting, unnecessary assignment expressions, and accessibility violations with explicit behavior-preserving code.
4. Require all touched production files to exceed all four metrics.
5. Run batch gates and Sonar rescan.

## Task 5: Batch 4 — Remaining per-file coverage deficits

**Files:** every production file reported by `scripts/verify-coverage-threshold.mjs` after Tasks 2–4.

1. Rank by uncovered branch count and business risk.
2. Add behavior-focused positive, negative, boundary, error, and asynchronous tests.
3. Do not change production code unless evidence identifies a testability or responsibility defect.
4. Run each owning Nx project uncached and require every applicable file metric to be strictly greater than 92%.

## Task 6: Batch 5 — Test-source Sonar findings

**Files:**

- `apps/ssi-portal/src/test/app/component-behavior.spec.ts`
- `apps/ssi-portal/src/test/app/settings-page.component.spec.ts`
- `apps/ssi-service/src/test/app/sqlite-repositories.spec.ts`
- Any additional test source still reported by the current scan.

1. Preserve test names, assertions, semantics, fixtures, and discovered case count.
2. Apply only evidence-backed structure fixes such as hook placement or parameterization.
3. Run affected tests, compare case counts, then run full project tests.

## Task 7: Final quality gates and controlled integration

1. Run `npm run lint`.
2. Run `npm run typecheck`.
3. Run all Jest projects uncached with coverage.
4. Require every production file and workspace total to exceed 92% for all four metrics.
5. Run `npm run build` and `npm run verify`.
6. Run `npm audit --audit-level=high` after explicit authorization for dependency metadata transmission.
7. Run a fresh local SonarQube analysis of the same worktree identity.
8. Require no unresolved in-scope Sonar issues, overall duplication below 3%, and all-code coverage above 92%; also report the governed new-code gate separately.
9. Create a new exact candidate commit and obtain Independent Checker PASS for that exact SHA.
10. Confirm `main` is unchanged, fast-forward locally, rerun integration validation, create a local baseline tag, and do not push.

## Controlled focused-refactor boundaries

### Entity application service

- Establish characterization coverage for transition/state, Maker-Checker,
  suppression, and supersede behavior before production edits.
- Limit production refactoring to the evidenced multi-responsibility and
  Cognitive Complexity in `transition()`.
- Separate transition validation, suppression approval, previous-active
  supersede, and next-record construction using business-meaningful helpers.
- Preserve exception type/message, repository call semantics, status
  transition, Maker/Checker controls, and API behavior.
- Do not refactor `create`, `update`, `revise`, `suppress`, or `revoke` without
  separate Sonar/coverage evidence.

### RMA application service

- Follow the complete baseline-first and characterization matrix supplied for
  `transition()` and `check()` before production edits.
- Refactor only evidenced responsibilities in `transition()` and `check()`;
  keep the remaining application methods unchanged without separate evidence.
- Preserve exception type/message, Maker/Checker rules, repository/audit
  semantics, transition states, API/OAS behavior, security, and performance
  boundaries.
- Record `STALE` as a specification/contract review item. Do not invent a
  decision path unless an explicit governed specification defines it.
- Require all four per-file coverage metrics strictly above 92%, followed by a
  Sonar rescan and the requested final evidence report.
