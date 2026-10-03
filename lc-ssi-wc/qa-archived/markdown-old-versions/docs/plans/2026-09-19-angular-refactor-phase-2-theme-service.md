# Angular Refactor Phase 2 ThemeService Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the existing theme preference state, persistence, system-color observation, and document application out of `AppComponent` without changing UI or behavior.

**Architecture:** Add one root-scoped `ThemeService` that owns the existing `ThemeMode` signal and browser/document effects. Preserve the template-facing `theme` signal and `setTheme()` method on `AppComponent` as thin delegates so the template and Settings component contract remain unchanged.

**Tech Stack:** Angular 22, TypeScript 6, Signals, Jest 30, Nx 23.

**Governance:** Base commit `4d4adf68c0d81bf6844a8058878ff83d714c686b` on branch `refactor`. Maker: Codex `/root`. Independent Checker: Codex `/root/phase0_checker` (working-tree PASS; exact-commit confirmation pending). Acceptance remains `NOT_ACCEPTED` until exact-commit Four-eyes confirmation.

---

### Task 1: Characterize ThemeService behavior with RED tests

**Files:**

- Create: `apps/ssi-portal/src/app/theme.service.spec.ts`
- Create after RED: `apps/ssi-portal/src/app/theme.service.ts`

**Step 1:** Test valid saved modes, invalid/missing fallback, document application, persistence, explicit selection, system preference changes, and absent `defaultView`.

**Step 2:** Run the focused spec before creating the service.

**Expected:** RED because `theme.service.ts` does not exist.

**Step 3:** Preserve the RED output under repository-local ignored `tmp/angular-refactor-phase-2/`.

### Task 2: Implement the minimum ThemeService

**Files:**

- Create: `apps/ssi-portal/src/app/theme.service.ts`
- Test: `apps/ssi-portal/src/app/theme.service.spec.ts`

**Step 1:** Inject `DOCUMENT`, initialize the existing `ThemeMode` signal, restore `ssi-theme`, persist the selected mode, apply `data-theme`, and observe `(prefers-color-scheme: dark)`.

**Step 2:** Reuse the existing pure `activeTheme()` helper; do not duplicate theme resolution logic.

**Step 3:** Run the focused spec and portal typecheck.

**Expected:** GREEN.

### Task 3: Replace AppComponent ownership with a compatibility delegate

**Files:**

- Modify: `apps/ssi-portal/src/app/app.component.ts`
- Modify: `apps/ssi-portal/src/app/component-behavior.spec.ts`

**Step 1:** Extend the existing behavior test double to provide `ThemeService` and assert template-compatible delegation.

**Step 2:** Inject `ThemeService`, expose its signal as `theme`, delegate `setTheme()`, and remove only the old constructor/apply implementation.

**Step 3:** Confirm `app.component.html`, routes, HTTP calls, WIP lifecycle, and visible behavior are unchanged.

**Step 4:** Run focused theme/component tests and portal typecheck.

### Task 4: Validate, independently review, and commit

**Step 1:** Run Prettier, lint, full portal tests, all project typechecks/tests, and the standard `npm run verify`; rerun the Angular build outside the restricted sandbox only if the known root-read restriction occurs.

**Step 2:** Require an Independent Checker to compare behavior, HTTP order, template/routes, tests, and exact scoped diff.

**Step 3:** Commit only the approved Phase 2 paths, then require exact-commit confirmation.
