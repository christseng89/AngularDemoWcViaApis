# Angular Refactor Phase 7 Checker Feature Implementation Plan

> For Codex: execute Red → Green → Refactor directly on `refactor` under the Product Owner's latest branch instruction; obtain independent exact-commit review before closure.

**Goal:** Move the Checker workspace, queue state and approval transport out of `AppComponent` into a guarded lazy `/checker` feature without changing its business workflow or API requests.

**Architecture:** The feature owns Checker tabs, governed pending count, SSI pending index and approval calls through a feature facade plus HTTP-only API service. The existing `SwiftDataCrudComponent` remains unchanged for governed RMA／Entity／Nostro checker tabs. The existing shared SSI read-only detail overlay remains in `AppComponent` for now; it receives a row from the routed feature and delegates approval back to it. This prevents a second Maker/WIP editor refactor in the same slice. Shell retains only navigation, count presentation and guarded detail bridge; no generic maintenance framework or cross-feature data store is introduced.

**Tech Stack:** Angular 22 standalone lazy routes and Signals, Jest 30, Nx 23, TypeScript 6.

**Base:** `refactor` commit `b3dfa913f0f6374da6a07b92549db6e62bfe4903`; no new branch, no DB／fixture／seed／backend／styles changes and no Push. Old non-Angular failures are classified separately and do not block the Angular slice.

---

### Task 1: Characterize route and guard (RED)

**Files:** `app.routes.spec.ts`, `component-behavior.spec.ts`, `tmp/angular-refactor-phase-7/`.

1. Add failing tests for guarded lazy `/checker`, direct URL activation, navigation guard-before-view/localStorage commit, browser Back, and no Checker queue API before feature entry.
2. Run focused Jest and record the expected RED output before changing production code.
3. Keep existing Maker WIP cancellation and denied-navigation assertions intact.

### Task 2: Characterize queue, tab and approval behavior (RED)

**Files:** new `checker-feature/checker-api.service.spec.ts`, `checker-feature/checker.facade.spec.ts`, `checker-feature/checker-route.component.spec.ts`.

1. Define exact existing GET sequence: SSI pending page + summary in parallel; OAS contract then governed resource pending queries. Assert request URLs, filters, count, loading/error, tab switching, sort/page and SSI row handoff.
2. Assert approval/rejection endpoint, actor, reason threshold, reload and fail-closed error presentation; never weaken Maker/Checker separation or server-authoritative lifecycle semantics.
3. Assert Back re-entry retains the user's tab/sort choices, while queue rows reload from authoritative APIs. Record RED output.

### Task 3: Extract the feature (GREEN/REFACTOR)

**Files:** `app.routes.ts`, `app.component.ts`, `app.component.html`, new `checker-feature/*`; a small shared SSI row type module only if required to avoid duplicated type definitions.

1. Add guarded lazy `/checker` route. Move Checker tabs/index to a standalone OnPush route component; retain existing `SwiftDataCrudComponent` without internal changes.
2. Move queue requests and approval POSTs into HTTP-only Checker API service; keep sorting/paging/presentation in a Checker-scoped facade. Preserve exact request order/count/payload and the governed OAS resource selection.
3. Remove superseded parent Checker queue state, methods, template and dead imports after reference and contract checks. Parent keeps the shared SSI detail overlay, shell count and an active-route bridge for review/decision/refresh only; delegate approval transport to the feature.
4. Keep `router-outlet` mounted while shared SSI detail opens, preserve ×/Esc behavior, direct URL and WIP guard. Do not add new CSS or business logic.

### Task 4: Verify and independent QA

1. Run focused tests, full no-cache Portal Jest, ESLint, Portal typecheck/build, `git diff --check`, and complete no-cache `npm run verify`.
2. Browser smoke on the built Portal with API interception/allowlist: direct `/checker`, all four tabs, SSI detail and approval behavior, Back/Forward tab preservation, zero real requests to existing `3100/3101`; distinguish mocks from live server-backed QA.
3. Stage only Phase 7 Angular files and this plan; create local candidate commit on `refactor`, no Push. Independent Checker/QA reviews the exact commit. Do not claim WIP Browser E2E, DB identity or backend page-by-page compliance if not executed or changed in this Angular-only slice.
