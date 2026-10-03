# Angular God Component Phase 0 Characterization Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish a reproducible, behavior-preserving Angular baseline before extracting any feature from `AppComponent`.

**Architecture:** Freeze the approved OpenAPI-Driven Vertical Feature Refactoring Architecture while measuring the current implementation. Treat governed maintenance (`x-ui-resources`) and resolution pages (`ResolutionPageDefinition`) as two controlled patterns that may share primitives but not domain orchestration.

**Tech Stack:** Angular 22, standalone components, Signals, zoneless change detection, Nx 23, Jest 30, TypeScript 6, ESLint.

**Governance:** Maker: Codex `/root`. Independent Checker: PENDING. This plan and its evidence are `NOT_ACCEPTED` until an independent checker validates the same exact candidate commit and evidence identities.

---

### Task 1: Freeze repository and Angular scope identity

**Files:**

- Create: `tmp/angular-refactor-phase-0/identity.txt`

**Step 1: Record the active branch, exact commit, scoped working-tree status, Node/npm versions, and Angular project configuration.**

**Step 2: Verify the repository path is `C:\Users\samfi\Downloads\outputs\lc-ssi-wc` and stop if it differs.**

**Step 3: Keep the evidence under repository-local `tmp/`; do not commit it.**

### Task 2: Run the Angular typecheck baseline

**Files:**

- Evidence only: `tmp/angular-refactor-phase-0/typecheck.txt`

**Step 1: Run `npx nx run-many -t typecheck --projects=ssi-portal,ssi-web-components --outputStyle=static`.**

**Step 2: Record exit status and complete output.**

**Expected:** Both Angular projects pass with no TypeScript errors.

### Task 3: Run the Angular unit-test baseline

**Files:**

- Evidence only: `tmp/angular-refactor-phase-0/unit-tests.txt`

**Step 1: Run `npx nx run-many -t test --projects=ssi-portal,ssi-web-components --configuration=ci --outputStyle=static`.**

**Step 2: Record suites, tests, coverage summary, exit status, and complete output.**

**Expected:** Existing characterization and contract tests remain green.

### Task 4: Capture architectural characterization metrics

**Files:**

- Create: `docs/plans/2026-09-19-angular-god-component-phase-0-baseline.md`

**Step 1: Record production/test file and line counts for both Angular applications.**

**Step 2: Record `AppComponent` and `SwiftDataCrudComponent` line counts, methods, signals/computed state, and direct component HTTP call sites.**

**Step 3: Inventory current navigation states, feature workspaces, WIP release paths, and both controlled parameter patterns.**

**Step 4: Mark Maker and Independent Checker separately; keep verdict `NOT_ACCEPTED` until independent review.**

### Task 5: Run the repository standard verification gate

**Files:**

- Evidence only: `tmp/angular-refactor-phase-0/npm-verify.txt`

**Step 1: Run `npm run verify`.**

**Step 2: Record lint, complete typecheck, complete test, and build results without modifying source files.**

**Expected:** The repository baseline passes the standard gate. If it fails, record the pre-existing failure exactly and do not repair it as part of Phase 0.

### Task 6: Independent QA handoff

**Files:**

- Review: `docs/plans/2026-09-19-angular-god-component-phase-0-baseline.md`
- Review: `tmp/angular-refactor-phase-0/*`

**Step 1: Provide the exact candidate commit and evidence identities to a distinct Independent Checker outside this Maker session.**

**Step 2: Require the checker to rerun or independently validate the same commands and behavioral inventory.**

**Step 3: Do not mark Phase 0 accepted and do not begin Phase 1 until the independent verdict is recorded.**
