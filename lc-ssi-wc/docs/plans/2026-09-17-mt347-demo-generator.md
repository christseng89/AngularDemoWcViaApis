# MT347 Demo Generator Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use the TDD orchestrator and execute this plan task-by-task.

**Goal:** Build an OO, parameter-driven MT347 Demo fixture generator that consumes the frozen v1.1 Oracle and produces a deterministic, zero-write dry-run dataset and reconciliation report.

**Architecture:** A read-only Oracle repository verifies the pinned SHA and parses the v1.1 contract into domain objects. A generator expands only the Oracle-provided contexts and separates SSI-owned negative fixtures from Full-FIN evidence-only contexts. A comparator proves the generated exact set matches the frozen Oracle; the CLI writes only workspace report files and has no database adapter.

**Tech Stack:** TypeScript 6, Node.js 22 strip-types, node:test, JSON.

---

### Task 1: Pin and load the frozen Oracle

**Files:**
- Create: `qa/FIX_DATA/src/ssi/oracle-contract.ts`
- Create: `qa/FIX_DATA/src/ssi/oracle.repository.ts`
- Test: `qa/FIX_DATA/src/ssi/oracle.repository.test.ts`

1. Write failing tests for exact SHA verification, schema/version checks and tamper rejection.
2. Run the focused test and confirm RED.
3. Implement typed domain objects and a filesystem repository with pinned SHA.
4. Run the focused test and confirm GREEN.

### Task 2: Generate deterministic Demo fixtures

**Files:**
- Create: `qa/FIX_DATA/src/ssi/mt347-demo.generator.ts`
- Test: `qa/FIX_DATA/src/ssi/mt347-demo.generator.test.ts`

1. Write failing tests asserting 208 groups, 3,120 unique contexts, 2,580 SSI-owned contexts and 540 OOS contexts.
2. Assert that the 36 OOS groups perform no SSI lookup and generate zero SSI route candidates.
3. Assert that every generated result has zero side effects and preserves the Oracle outcome/reason.
4. Implement the generator using only Oracle rows and variants; do not infer business rules.
5. Run tests and confirm GREEN.

### Task 3: Compare generated data against the Oracle

**Files:**
- Create: `qa/FIX_DATA/src/ssi/oracle-comparator.ts`
- Test: `qa/FIX_DATA/src/ssi/oracle-comparator.test.ts`

1. Write failing tests for exact-match PASS and one-field mismatch FAIL.
2. Implement deterministic comparison and reconciliation metrics.
3. Run tests and confirm GREEN.

### Task 4: Add zero-write dry-run CLI

**Files:**
- Create: `qa/FIX_DATA/src/ssi/dry-run.ts`
- Modify: `qa/FIX_DATA/src/ssi/README.md`
- Modify: `package.json`

1. Add `demo:dry-run:ssi-mt347` invoking the TypeScript CLI with Node strip-types.
2. Pin the v1.1 Oracle path and SHA in configuration.
3. Emit a JSON report under `qa/FIX_DATA/ssi/generated/` containing `databaseWrites=0`, exact reconciliation and mismatch list.
4. Document Gate 1 boundaries and explicitly state that DB/runtime apply is unsupported.

### Task 5: Validate

1. Run focused Node tests for all SSI Generator files.
2. Run the dry-run twice and verify byte-identical generated dataset content (excluding no timestamps, because output is deterministic).
3. Run ESLint and TypeScript checks.
4. Run project tests/build as appropriate.
5. Run `npm audit --audit-level=high` and report any pre-existing dependency findings separately.

