# Phase 10 SWIFT Data Feature Refactoring Implementation Plan

> **For Codex:** Execute this plan on the Product Owner-authorized existing `refactor` working tree; do not create a branch/worktree or push. Use @angular-best-practices and @lint-and-validate. RED → Green → Refactor evidence belongs under repo-local `tmp/`.

**Goal:** Replace the second Angular God Component (`SwiftDataCrudComponent`) with a route-lazy, feature-owned governed-maintenance feature while preserving its OAS-driven screens, HTTP payloads, lifecycle, WIP protection and import/export behavior.

**Architecture:** A lazy `/swiftdata` route owns the existing view without loading it from the application shell. The component becomes a thin feature host for scoped Index, Editor/WIP, RMA selection and import/export collaborators. Typed HTTP-only services do I/O; governed `x-ui-resources` metadata remains the source of field/options behavior. Do not unify it with `ResolutionPageDefinition` or rewrite domain rules.

**Tech Stack:** Angular standalone routes/signals/Formly, RxJS, Jest, Nx, Playwright browser smoke.

---

### Task 1: Baseline and route-level lazy boundary

**Files:** `apps/ssi-portal/src/app/app.routes.ts`, `app.routes.spec.ts`, `app.component.ts`, `app.component.html`, `app-shell-integration.spec.ts`, `component-behavior.spec.ts`, new `swift-data-feature/swift-data-route.component.ts` and focused tests.

1. Record exact base HEAD, tracked/untracked ownership, all current Swift Data API request paths/payloads and WIP navigation tests. Preserve `/dashboard`, `/maker`, `/checker` and all other URLs. Make `/swiftdata` canonical while retaining the `/` anchor; the Root initializer navigates to the persisted Dashboard/Maker or to `/swiftdata` when the home view is SWIFT Data.
2. RED: assert Root no longer imports/instantiates `SwiftDataCrudComponent`; `/swiftdata` is guarded `loadComponent()`; cold `/settings` does not load its chunk or issue SWIFT Data API requests; leaving `/swiftdata` with a revision reservation calls existing `canDeactivate()` once and denies navigation when cancellation fails. Observe the expected failures before production edits.
3. GREEN: move the existing Swift Data host into the lazy route, wire route activation/refresh/deactivation through a narrow port, remove the unused Root initial-record selectors, and keep the visible template structure unchanged. Do not change Checker’s route contract or maintenance WIP semantics.
4. Run affected route/guard/component tests, Portal lint/typecheck, production build and isolated browser cold-start/WIP smoke. Verify no external request is delivered to `3100/3101` in browser QA.

### Task 2: HTTP-only API boundary

**Files:** `swift-data-crud.component.ts`, new `swift-data-feature/swift-data-api.service.ts`, typed model file, focused service/component tests.

1. RED: capture contract, currency, RMA policy, index query/page, pair-state, bank lookup, import, revision/cancel, save/submit/approve/reject/suppress/revoke request count/order/method/body. Assert feature component has no direct `HttpClient` or hard-coded API base.
2. GREEN: move only transport into a feature-scoped HTTP-only API service; keep operations, error messages, state transitions, and resource-specific policies in the feature owner. Do not create a generic universal maintenance API adapter.
3. Run tests, Portal lint/typecheck and API payload regression after the edit.

### Task 3: Split feature state by behavior, not line count

**Files:** `swift-data-crud.component.ts`, narrow feature-scoped Index/Editor/RMA collaborators and focused specs as needed.

1. RED: characterize status/search/sort/page, governed field/option mapping, bank selection, RMA two-direction message state, Add/Edit/View/Checker/Suppress/Revise, WIP concurrent deactivation and fail-closed release. Preserve the latest maintenance and RMA Memory decisions.
2. GREEN: move the cohesive state and operations into narrow collaborators, retaining one feature session for Index ↔ Editor WIP continuity; do not create a 1,000-line replacement facade or copy RMA/domain rules into generic UI. Keep `SwiftDataCrudComponent` as the template host and only change bindings required by ownership.
3. Re-run affected tests, Portal lint/typecheck and browser workflows. Remove only proven-superseded code after reference/compatibility checks.

### Task 4: Export and final acceptance

**Files:** `swift-data-crud.component.ts`, new feature-scoped export collaborator, export tests, browser smoke evidence.

1. RED: characterize Excel/JSON filename, metadata, sheet/column contents, download cleanup and failure messages.
2. GREEN: move export generation/download behind a narrow collaborator; retain existing lazy `exceljs` import and exact output behavior. Do not change stylesheet or visual interaction without separate BA/QA approval.
3. Run complete no-cache `npm run verify`, Portal production build/chunk checks, isolated browser positive/negative/WIP smoke and `git diff --check`. Unrelated DB/seed/fixture/runtime state cannot block this Angular-only refactor.
4. Create a reviewed local candidate commit on `refactor` only. Independent Checker and distinct QA must approve the same exact commit and non-Git build/evidence identities before Phase 10 closes. No merge/push or next phase automatically.

**Scope exclusions:** DB/seed/API contract and business-rule changes; `ResolutionPageDefinition` redesign; universal OpenAPI adapter; style/layout redesign; new branch/worktree; remote push.
