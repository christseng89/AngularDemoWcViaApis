# Angular Refactor Phase 6 Audit Feature Implementation Plan

> For Codex: execute Red → Green → Refactor directly on `refactor` under the Product Owner's latest branch instruction; obtain independent exact-commit review before closure.

**Goal:** Move the read-only Audit workspace out of `AppComponent` into a guarded lazy feature without changing its visible behavior or API requests.

**Architecture:** The Audit route owns its page state and loads only after navigation. An Audit-scoped facade handles tab, sorting, pagination, detail, loading and error state; an HTTP-only service performs the three existing GET requests in the same order and with the same payloads. The shared `GovernanceIndexTableComponent`, `GovernedRecordViewComponent`, loading and error primitives remain unchanged. `AppComponent` retains only shell navigation and the existing shared SSI record overlay callback. Do not combine `x-ui-resources` Audit with `ResolutionPageDefinition` orchestration or touch `SwiftDataCrudComponent`.

**Tech Stack:** Angular 22 standalone routes and Signals, Jest 30, Nx 23, TypeScript 6.

**Base:** `refactor` commit `16ecd02344dc6da8c3178ddac75b4696bf8a5e15`; no new branch, no DB/fixture/seed changes, no Push. Unrelated DB/environment failures do not block this Angular-only slice.

---

### Task 1: Characterize Audit navigation (RED)

Add failing route and parent behavior tests for `/audit` lazy loading, existing `appRouteCanActivate`, direct URL bootstrap, sidebar and browser-history guard-before-view/storage commit, and no Audit API call before entry. Record RED output under ignored `tmp/angular-refactor-phase-6/`.

### Task 2: Extract Audit state and HTTP (RED → GREEN)

Add failing tests for Audit-scoped state: initial RMA tab, four governed tabs, exact three GET requests on load, loading/error behavior, sort/page, detail, and SSI overlay handoff. Create `audit-feature/audit-api.service.ts` as HTTP-only transport, `audit-feature/audit.facade.ts` as feature-scoped state, and `audit-feature/audit-route.component.*` for the existing view. Keep the governed OAS fields and current presentation helpers as the only metadata source. Do not alter API URLs, request count/order/payload, labels, tab order, or responsive styles.

### Task 3: Remove superseded parent Audit code

Move the Audit template, overlay, signals and methods from `AppComponent`; retain only shell-level detail-open presentation and shared SSI record overlay callback if required. Remove parent Audit prefetch/`ensureFeatureData` loading so no Audit request runs before `/audit`. Preserve `×`/Esc close behavior and route guard protection. Prove removed code is unreferenced with search and affected tests.

### Task 4: Verify and review

Run focused tests, full no-cache Portal Jest, Portal lint/typecheck/build, `git diff --check`, `npm run verify`, lazy-chunk inspection and isolated Browser smoke with API/network allowlist. Confirm no requests to existing 3100/3101 during smoke. Stage only Phase 6 files, commit locally on `refactor`, and obtain independent Checker verdict on the exact commit. No Push. Report any Browser/server-backed WIP case not executed separately; unrelated DB fixture work cannot be relabeled as an Angular defect.
