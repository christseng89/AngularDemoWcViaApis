# Angular Refactor Phase 3 AppShell Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract the existing primary navigation, brand, page header, and layout container into a presentational AppShell without changing navigation, UI, or business behavior.

**Architecture:** A standalone OnPush `AppShellComponent` accepts current view, checker count, and detail-state inputs, emits navigation/refresh requests, and projects the existing feature content into the same `<main>` position. `AppComponent` continues to own view persistence, feature data loading, WIP cleanup, HTTP, overlays, and all domain orchestration. This phase does not introduce Angular Router or lazy routes.

**Tech Stack:** Angular 22 standalone components, Signals, Jest 30, Nx 23, TypeScript 6.

**Governance:** Base commit `950ae3838aab473e659ee40af86d23876d70ad15` on `refactor`. Maker: Codex `/root`; Independent Checker: Codex `/root/phase0_checker` (working-tree PASS). Acceptance remains `NOT_ACCEPTED` until exact-commit Four-eyes PASS.

---

### Task 1: Characterize the shell before code

**Files:** `apps/ssi-portal/src/app/app-shell.component.spec.ts`, `apps/ssi-portal/src/app/app-shell.component.ts`, `apps/ssi-portal/src/app/app-shell.component.html`

1. Write failing tests for the shell's brand, eight primary navigation items/order, view-specific active state and headings, checker badge, refresh visibility, typed navigation/refresh output, and projected `<main>` slot.
2. Run `npx jest --config apps/ssi-portal/jest.config.ts --runInBand --no-cache apps/ssi-portal/src/app/app-shell.component.spec.ts`; preserve RED evidence under ignored `tmp/angular-refactor-phase-3/`.
3. Implement only presentational inputs, outputs, and the mechanically moved template.
4. Run focused tests, Prettier, ESLint, and portal typecheck until GREEN.

### Task 2: Integrate without moving orchestration

**Files:** `apps/ssi-portal/src/app/app.component.html`, `apps/ssi-portal/src/app/app.component.ts`, `apps/ssi-portal/src/app/component-behavior.spec.ts`

1. Add a failing parent-template contract test asserting projected content remains in AppComponent and AppShell events delegate to existing `navigate()`/`refresh()`.
2. Replace only the outer `<div class="shell">`, sidebar, header and closing tags with `<ssi-app-shell>`; import it into `AppComponent`.
3. Preserve existing `navigate()`, `savedView()`, feature data loading, WIP/canDeactivate, HTTP, overlays, deferred feature blocks, and all content inside `<main>`.
4. Run focused shell/parent tests, all portal tests, portal typecheck, and compare baseline HTTP call count/order and template content.

### Task 3: Gate, independent QA, exact commit

1. Run Prettier, lint, typecheck, tests, `npm run verify`, and a real Angular build outside the restricted sandbox only if the known root-read restriction occurs.
2. Confirm no CSS, API, route, OAS/page-parameter, or visible-copy changes; verify navigation still uses the existing controlled handler.
3. Request Independent Checker working-tree PASS; stage only agreed files and commit on `refactor`.
4. Require Independent Checker PASS on the exact candidate commit before announcing Phase 3 complete.
