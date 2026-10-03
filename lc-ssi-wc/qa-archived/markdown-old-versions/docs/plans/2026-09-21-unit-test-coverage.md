# Unit Test Coverage Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use the TDD orchestrator workflow to implement this plan task-by-task.

**Goal:** Raise every instrumented production TypeScript file above 92% for statements, branches, functions, and lines, while keeping branch/function metrics with zero executable items as not applicable.

**Architecture:** Keep production behavior unchanged and expand the existing Jest suites with behavior-focused boundary, error, optional-input, lifecycle, and rendering tests. Coverage remains collected from every production TypeScript file through each project's existing `collectCoverageFrom`; a verification script will reject both a weak individual file and a weak weighted workspace total.

**Tech Stack:** Nx 23, Jest 30, TypeScript 6, Angular 22, NestJS 11.

---

### Task 1: Establish the governed baseline

**Files:**
- Read: `coverage/**/coverage-summary.json`
- Create: `scripts/verify-coverage-threshold.mjs`
- Test: `scripts/verify-coverage-threshold.test.mjs`

1. Write a failing verifier test covering below-threshold files, zero-total metrics, missing reports, and weighted totals.
2. Run the verifier unit test and retain the expected RED result.
3. Implement the minimum deterministic coverage-summary verifier with a strict greater-than-92 threshold.
4. Run the verifier test and confirm GREEN.

### Task 2: Cover BFF and reference-service forwarding behavior

**Files:**
- Modify: `apps/ssi-bff/src/main.spec.ts`
- Modify: `apps/mock-reference-services/src/main.spec.ts`

1. Add tests for environment URL overrides, empty and populated query combinations, optional lookup parameters, dashboard counts, upstream non-JSON/error behavior, and startup wiring.
2. Run each affected project uncached with coverage.
3. Refactor repeated forwarding expectations into table-driven helpers.
4. Run the strict verifier for these projects.

### Task 3: Cover shared domain and portal pure logic

**Files:**
- Modify existing `*.spec.ts` beside uncovered files under `libs/domain/src/lib/` and `apps/ssi-portal/src/app/`.
- Create a colocated `*.spec.ts` only when no relevant suite exists.

1. Test uncovered decision-table rows and boundary values in pure functions first.
2. Exercise mapper, presenter, index, selection, session, and dependency invalidation branches with realistic typed fixtures.
3. Run `ssi-portal` and `domain` uncached with coverage and the strict verifier.

### Task 4: Cover portal components and facades

**Files:**
- Modify existing component/facade specifications under `apps/ssi-portal/src/app/`.

1. Add user-observable tests for loading, empty, success, failure, retry, keyboard, close, and stale-selection states.
2. Cover asynchronous success and rejection paths without weakening assertions.
3. Run portal lint, typecheck, tests, and the strict verifier.

### Task 5: Cover service policies, adapters, controllers, and repositories

**Files:**
- Modify existing specifications under `apps/ssi-service/src/app/`.

1. Prioritize files with the largest uncovered branch count.
2. Add boundary and fail-closed tests for each uncovered governed decision.
3. Exercise controller delegation, repository transaction/rollback, pagination, validation, lookup, and stale-identity branches.
4. Run `ssi-service` uncached with coverage after each coherent batch.

### Task 6: Enforce and validate the final gate

**Files:**
- Modify Jest configuration only to add honest thresholds; do not change collection scope or add exclusions.

1. Run `npm run lint`.
2. Run `npm run typecheck`.
3. Run `npx nx run-many -t test --configuration=ci --skip-nx-cache --outputStyle=static`.
4. Run the strict per-file and weighted coverage verifier and require every applicable metric to be greater than 92%.
5. Run `npm run build` and `npm audit --audit-level=high`.
6. Record remaining warnings, exact Git status, and the independent-checker requirement without self-approving the candidate.
