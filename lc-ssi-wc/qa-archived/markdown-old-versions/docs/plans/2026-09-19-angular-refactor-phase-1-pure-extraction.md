# Angular Refactor Phase 1 Pure Extraction Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove pure models, constants, and presentation helpers from `AppComponent` without changing UI, HTTP, lifecycle, or business behavior.

**Architecture:** Extract only dependency-free or type-only code into narrowly named modules. Keep both controlled parameter patterns separate and leave all orchestration, Signals, HTTP, WIP, Maker/Checker, and route behavior in the existing component until their later feature slices.

**Tech Stack:** Angular 22, TypeScript 6, Jest 30, Nx 23, standalone components, Signals.

**Governance:** Maker: Codex `/root`. Independent Checker: Codex `/root/phase0_checker` (working-tree PASS; exact-commit confirmation pending). Acceptance remains `NOT_ACCEPTED` until the exact candidate commit and evidence are independently checked.

---

### Task 1: Extract presentation primitives using TDD

**Files:**

- Create: `apps/ssi-portal/src/app/app-presentation.spec.ts`
- Create: `apps/ssi-portal/src/app/app-presentation.ts`
- Modify: `apps/ssi-portal/src/app/app.component.ts`

**Step 1:** Add focused tests for local calendar dates, payment source labels, ARIA sort direction, sort indicators, active theme, and governed audit column lookup.

**Step 2:** Run the focused test and preserve RED evidence showing the module does not exist.

**Step 3:** Implement the pure module and replace local declarations with imports.

**Step 4:** Run the focused test, component behavior suite, portal typecheck, and portal unit tests.

### Task 2: Extract feature-neutral view models

**Files:**

- Create: `apps/ssi-portal/src/app/app-view.models.spec.ts`
- Create: `apps/ssi-portal/src/app/app-view.models.ts`
- Modify: `apps/ssi-portal/src/app/app.component.ts`

**Step 1:** Add compile/runtime contract tests for the existing view, theme, governance tab, BIC target, and message-format values.

**Step 2:** Preserve RED evidence before creating the module.

**Step 3:** Move only type declarations; do not introduce state or a shared store.

**Step 4:** Run focused and regression validation.

### Task 3: Extract FIN 5x catalogue constants

**Files:**

- Create: `apps/ssi-portal/src/app/fin-5x-catalog.spec.ts`
- Create: `apps/ssi-portal/src/app/fin-5x-catalog.ts`
- Modify: `apps/ssi-portal/src/app/app.component.ts`

**Step 1:** Characterize the existing catalogue ordering, scenario identity, defaults, expectations, and executable/reference-only states.

**Step 2:** Preserve RED evidence before creating the module.

**Step 3:** Move constants and their private construction helpers without changing values or order.

**Step 4:** Run focused tests, component behavior, portal tests, and standard verification.

### Task 4: Independent QA and exact commit

**Step 1:** Confirm zero endpoint, payload, template, visible copy, lifecycle, or parameter-contract changes.

**Step 2:** Require an Independent Checker to validate RED/GREEN evidence and the exact candidate diff.

**Step 3:** Commit only after the checker verdict permits it, then reconfirm the exact Git commit.
