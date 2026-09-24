# SSI Release Convergence Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use acceptance-orchestrator to implement this plan task-by-task.

**Goal:** Close the MT2/MT3/MT7 and MT347 release blockers in one governed change set and prove the release against one code, OAS, parameter, fixture, database-snapshot, and evidence identity.

**Architecture:** Discovery returns an indivisible, versioned SSI route and opaque eligibility snapshot; execution accepts that exact selected route and revalidates it fail-closed. Operational, QA, negative, and boundary data are isolated at the repository query boundary, while the UI remains a renderer of the OAS/parameter contract.

**Tech Stack:** TypeScript 6, NestJS 11, Angular 22, SQLite WAL, Nx/Jest, Playwright, OpenAPI 3.1, SonarQube Community Build 26.9.

---

### Task 1: Lock the discovery-to-resolve route contract

**Files:**
- Modify: `libs/contracts/src/page-parameters.ts`
- Modify: `openapi/swift-data-service.v1.json`
- Modify: `apps/ssi-service/src/app/page-parameters/page-parameter-lookup.service.ts`
- Modify: `apps/ssi-service/src/app/page-parameters/resolution-page-submission.adapter.ts`
- Modify: `apps/ssi-portal/src/app/resolution-workbench/page-parameter.client.ts`
- Modify: `apps/ssi-portal/src/app/resolution-workbench/parameter-form-values.ts`
- Test: colocated `*.spec.ts` contract, service, and portal tests

1. Add failing tests requiring `eligibilitySnapshot`, `selectedRouteIdentity`, route binding, SSI/applicability/Nostro/RMA IDs and versions, definition/fixture identity, and canonical context SHA.
2. Run the focused tests and record the expected failures.
3. Implement discovery transport and atomic UI selection without bank-only de-duplication.
4. Implement execution revalidation; reject stale, mismatched, unavailable, mixed, or ambiguous routes with all side-effect flags false.
5. Run focused lint, typecheck, unit, and stale-route API/UI tests.

### Task 2: Govern SSI-bank versus Nostro-servicer relationship

**Files:**
- Modify: `libs/contracts/src/page-parameters.ts`
- Modify: `parameters/resolution-page-scenarios.mt2-pacs009.sr2026.json`
- Modify: `parameters/resolution-page-scenarios.sr2026.json`
- Modify: `apps/ssi-service/src/app/page-parameters/resolution-page-submission.adapter.ts`
- Test: page-definition, adapter, and acceptance specs

1. Add failing acceptance cases for `SAME`, `DIFFERENT`, and `NOT_APPLICABLE`.
2. Add the machine-readable scenario policy and route attribute; never infer it from display BIC alone.
3. Apply the policy before MT/MX output composition.
4. Run MT2/MT3/MT4/MT7 focused policy tests.

### Task 3: Preserve negative provenance and isolate data families

**Files:**
- Modify: `apps/ssi-service/src/app/fin-controlled-fixture.service.ts`
- Modify: typed SQLite repository/model files under `apps/ssi-service/src/app/`
- Modify: `qa/fixtures/mt347/mt347-negative.v1.json`
- Modify: `parameters/mt347-fixture-binding-manifest.sr2026.json`
- Test: fixture, provenance, ownership, ambiguity, and fail-closed specs

1. Add failing tests for missing/wrong/duplicate provenance, ownership, dedicated source, and credited-account ambiguity.
2. Preserve machine fixture provenance and ownership losslessly instead of replacing it with `SYNTHETIC_DEMO`.
3. Isolate `OPERATIONAL`, `QA`, `NEGATIVE`, and `BOUNDARY` families in lookup and resolve.
4. Ensure every executable negative case has one machine-readable failure state and cannot select a positive candidate.
5. Rebuild the controlled snapshot and verify fixture IDs and versions.

### Task 4: Normalize validation precedence and error taxonomy

**Files:**
- Modify: `apps/ssi-service/src/app/page-parameters/resolution-page-submission.adapter.ts`
- Modify: `apps/ssi-service/src/app/fin-field-resolution.service.ts` only if downstream behavior remains incorrect after page-profile preflight
- Modify: governed scenario parameter files
- Test: adapter, controlled-resolution, and browser-runner contract specs

1. Add failing tests proving unsupported tag precedes option validation.
2. Return 422 `FIELD_NOT_SUPPORTED` when the page/scenario profile lacks the tag; return 422 `OPTION_CONSTRAINT_VIOLATION` only for an allowed tag with a disallowed option.
3. Canonicalize one expected HTTP/code per negative case: 422 request/rule violation, 409 eligible-state/profile/version conflict, 500 non-development controlled-configuration failure.
4. Require `payloadGenerated`, `confirmedResolutionCreated`, and `repairQueueCreated` to be false for every rejection.

### Task 5: Make Nostro/RMA eligibility scoped and indexed

**Files:**
- Modify: Nostro and RMA SQLite repository/application-service files under `apps/ssi-service/src/app/`
- Modify: `scripts/rebuild-demo-database.py`
- Modify: canonical seed/overlay inputs only through governed rebuild scripts
- Test: repository query-plan, ambiguity, concurrency, and snapshot-parity tests

1. Add repository tests for typed `findEligible`/`findAuthorised` queries with fixture-family scope.
2. Replace application `.list()` full-table filtering with DB-side predicates.
3. Add scoped indexes and normalize RMA message-type membership where required.
4. Clean operational equal-rank ambiguity only after isolating QA/negative data; do not weaken negative fixtures.
5. Record row counts, query plans, cold/hot p50/p95/max, WAL/checkpoint pages, busy timeout, and concurrent resolve/reload behavior.

### Task 6: Repair MT2 release automation and coverage

**Files:**
- Modify: `scripts/e2e-mt2-final-ui.mjs`
- Modify: `apps/ssi-service/src/app/fin-field-resolution.service.spec.ts`
- Do not modify: `scripts/mt2-final-qa/sonar-current-analysis.mjs`

1. Add/adjust runner contract tests for the parameter-driven index, single-click navigation, and current Bank Service controls.
2. Update the runner without adding message-specific UI judgment.
3. Add real branch tests that raise `fin-field-resolution.service.ts` branch coverage from 94.91% to at least 95%; do not lower the threshold.
4. Run `npm run qa:mt2:final` and retain the generated evidence.

### Task 7: Produce one immutable release-candidate evidence set

**Files:**
- Generate under governed `qa/**/evidence/` locations
- Update: evidence manifests and the operating-model manifest only after every gate passes

1. Stop data mutation and calculate code/OAS/TDD/parameter/fixture/DB logical-snapshot hashes.
2. Run lint, typecheck, all unit/integration tests, builds, MT2 final QA, MT3/MT7 full browser matrices, and SonarQube.
3. Verify every enabled currency has at least three authorised complete routes and exactly one best default in the operational scope.
4. Verify MT and pacs.009 outputs originate from the same selected route snapshot.
5. Obtain BA, QA, DBA, and BE 4-eyes sign-off against the identical manifest.
6. Mark the release `GO` only when every P0/P1 criterion has fresh evidence; otherwise retain `NO-GO` with exact blockers.

### Change-control note

The shared worktree already contains extensive user-owned changes. Do not reset, discard, or automatically commit unrelated files. Commits are deferred until the integrated diff can be partitioned without absorbing user-owned work.
