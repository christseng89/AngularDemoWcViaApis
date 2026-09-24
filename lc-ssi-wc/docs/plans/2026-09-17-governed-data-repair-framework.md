# Governed Data Repair Framework Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a zero-write Dry Run framework that audits and plans repairs for Entities, Nostro, SSI, and RMA from one API snapshot.

**Architecture:** OOD/OOP is a release gate. Immutable Value Objects model canonical identities; domain Policy classes own deterministic repair decisions; Repository and ReportWriter interfaces are ports; API/filesystem implementations are adapters; an Application Service orchestrates the use case. No procedural batch `main()` may own business rules, and no mutation adapter is included in this phase.

**Tech Stack:** Node.js 22, TypeScript 6, node:test, worker-safe deterministic hashing.

---

### Task 1: Domain contracts and canonical identities

**Files:**
- Create: `qa/fixtures/rma/governed-data-repair/domain.ts`
- Test: `qa/fixtures/rma/governed-data-repair/domain.test.ts`

1. Write failing tests for BIC8/BIC11 normalization and the four domain keys.
2. Run the focused Node test and retain RED evidence.
3. Implement immutable Value Objects (`CanonicalBic`, four canonical keys), domain entities, and policy classes.
4. Re-run the focused test and require PASS.

### Task 2: Four-domain Dry Run planner

**Files:**
- Create: `qa/fixtures/rma/governed-data-repair/planner.ts`
- Test: `qa/fixtures/rma/governed-data-repair/planner.test.ts`

1. Write failing tests for Entities, Nostro, SSI, RMA and cross-table issues.
2. Run tests and retain RED evidence.
3. Implement deterministic plans without POST, PUT, DELETE, or DB access.
4. Re-run tests and require PASS.

### Task 3: Snapshot and reporting adapters

**Files:**
- Create: `qa/fixtures/rma/governed-data-repair/api-snapshot.repository.ts`
- Create: `qa/fixtures/rma/governed-data-repair/json-report.writer.ts`
- Create: `qa/fixtures/rma/governed-data-repair/cli.ts`
- Modify: `package.json`

1. Add contract tests that reject grouped/paged responses where raw arrays are required.
2. Implement GET-only snapshot loading and SHA evidence.
3. Implement consolidated JSON report output under `tmp/`.
4. Add `demo:audit:governed-data:v2`; do not add an Apply command.

### Task 4: Validation

1. Run all new focused tests.
2. Run ESLint on the new source.
3. Run TypeScript typecheck.
4. Execute the CLI against the local API and confirm `databaseWrites=0`.
5. Preserve the generated report under `tmp/`; do not commit runtime evidence.
