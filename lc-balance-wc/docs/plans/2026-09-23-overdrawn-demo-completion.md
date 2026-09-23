# OVERDRAWN Demo Completion Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `tdd-orchestrator` and `lint-and-validate` to implement this plan task-by-task.

**Goal:** Finish the approved LC Excess demo on `OVERDRAWN` with the smallest evidence set that still proves every approved business rule and Quality Gate.

**Architecture:** Keep the completed domain／service implementation authoritative. Close remaining work through consolidated API、Angular、Business Case Runner and release gates, reusing existing components and parameterized tests. Do not introduce Return Documents、partial cancellation、Formal Increase cure、`FX_RATE_PENDING` or production midpoint fallback.

**Tech Stack:** TypeScript, Node.js, SQLite, Jest, Supertest, Angular, OpenAPI 3.0, Docker／ARM64 SonarQube, OpenSpec.

---

### Task 1: Consolidated API and OpenAPI Contract (5.S2)

**Files:**
- Modify: `analysis/balance-component-api.yaml`
- Modify only if a missing assertion proves a gap: `microservices/balance-component/test/unit/makerExcessApi.test.ts`
- Test: `microservices/balance-component/test/unit/makerExcessApi.test.ts`

1. Write one table-driven contract test for any uncovered response／negative endpoint requirement; run it and retain RED.
2. Add only the missing schema/example/response definitions to the OAS; do not change approved runtime behavior.
3. Run focused API tests, an OAS parser/validator, Balance typecheck/lint/build and OpenSpec strict validation; expect all PASS.
4. Update `tasks.md` and one consolidated evidence file, then commit the API/OAS checkpoint on `OVERDRAWN`.

### Task 2: Consolidated Angular Contract (6.S1)

**Files:**
- Modify: `src/app/transaction-builder/balance-component.model.ts`
- Modify: `src/app/transaction-builder/balance-component-api.service.ts`
- Modify: `src/app/shared/feedback/api-error-presenter.ts`
- Modify only existing Transaction Builder/result components as required.
- Test: matching `*.spec.ts` files under `src/app/transaction-builder/` and `src/app/shared/feedback/`.

1. Add focused failing tests for missing typed fields, post-Acknowledge Amount protection, whole Fix replacement, three allowed error states and sequential A3S guidance.
2. Implement the minimum changes in existing components; create no new screen and never show `FX_RATE_PENDING`.
3. Run focused tests, then full Angular tests／coverage and build; expect approved coverage and no regressions.
4. Record one evidence file and commit the Angular checkpoint on `OVERDRAWN`.

### Task 3: Minimal OVERDRAWN Business Case Matrix (7.S1)

**Files:**
- Modify: `backend/data/businessCases.js`
- Modify: `backend/test/businessCases.test.js`
- Modify: `backend/test/runCase.test.js`
- Modify only existing Business Case Runner registry/UI files needed to expose selectable `OVERDRAWN` cases.

1. Add table-driven RED tests for the minimal matrix named in 7.S1, including Import A2 and Export B2 Increase followed by a fresh Submit.
2. Implement cases by composing existing runner steps and shared assertions; do not duplicate each cross-product.
3. Prove zero-write errors against real Balance tables and prove downstream completion leaves Approved Excess unchanged.
4. Run backend tests, one selected case and Run All against Balance plus virtual FX; retain one consolidated evidence file and commit.

### Task 4: Full Regression Gate (7.S2)

**Files:**
- Evidence only unless a regression exposes a defect.

1. Generate fresh Balance、Angular and backend coverage.
2. Run all Balance、Angular、backend and Business Case Runner suites.
3. If a failure occurs, use RED→GREEN with the smallest fix, then repeat the affected full gate.
4. Record commands, totals and LCOV paths in one release evidence file; commit only necessary fixes/evidence.

### Task 5: Documentation and Traceability (8.S1)

**Files:**
- Modify: `openspec/changes/unified-lc-excess-framework/requirement-traceability.md`
- Modify: affected pages under `docs/obsidian-balance-kb-v3.2/`
- Modify: `analysis/balance-component-api.yaml` only if validation finds a contract mismatch.

1. Map each 84/84 requirement row and C-01–C-07 resolution to a passing evidence reference.
2. Update only affected pages; remove no approved rule and create no duplicate narrative document.
3. Run OAS validation and `openspec validate --all --strict --no-interactive`; expect PASS.
4. Commit the documentation checkpoint on `OVERDRAWN`.

### Task 6: ARM64 SonarQube Quality Gate (8.S2)

**Files:**
- Reuse/adapt: `../lc-ssi-wc/qa/docker/`
- Verify: `sonar-project.properties`
- Create: minimal local QA configuration/evidence under the existing project QA convention.

1. Build/start pinned ARM64 PostgreSQL、SonarQube and scanner images with ephemeral secrets; never store tokens/passwords in files or logs.
2. Scan a clean checkout at the exact release-candidate SHA using freshly generated LCOV files and `sonar.qualitygate.wait=true`.
3. Require scanner and Compute Engine success, then export project key、SHA、LCOV hashes、analysis ID and Quality Gate measures.
4. Pass exactly: New Code issues 0, hotspots reviewed 100%, coverage ≥92%, duplication ≤1%, maintainability/medium/security issues 0; Overall coverage ≥92%, duplication ≤3%, high/medium/security issues 0, maintainability ≤20, hotspots reviewed 100%.

### Task 7: Final 4-Eyes Approval and Archive (8.S3)

**Files:**
- Modify: `openspec/changes/unified-lc-excess-framework/tasks.md`
- Modify: final consolidated evidence only.

1. Obtain independent Trade Finance BA、4-Eyes engineering and QA PASS; fix only blockers with TDD.
2. Present the final gate summary for approval.
3. After approval, run `openspec archive unified-lc-excess-framework --yes` and strict validation.
4. Verify archive/current specs and stop; do not merge to `main`.
