# Phase 9C Root Shell Closure Implementation Plan

> **For Codex:** Execute RED → Green → Refactor on the Product Owner-authorized `refactor` working tree; do not create a branch, worktree or push. Keep Phase 10 `SwiftDataCrudComponent` unchanged. Use @angular-best-practices and @lint-and-validate.

**Goal:** Remove proven-superseded Root feature data/cache and business ownership, leaving `AppComponent` as application composition, navigation, route lifecycle and global presentation while preserving SSI WIP and all current routes.

**Architecture:** Route features remain `loadComponent()` / `loadChildren()` lazy. Shared SSI read-only detail presentation can remain in the existing Root template, but its data loading and Checker decision workflow must have explicit narrow ownership rather than becoming another God facade. The pre-existing Swift Data view is a Phase 10 exception, not grounds to refactor `SwiftDataCrudComponent` now. No further template/presentation extraction merely to reduce line count.

**Tech Stack:** Angular standalone components, signals, typed route ports, Jest, Nx, browser smoke.

---

### Task 1: Freeze 9C baseline and remove dead Root feature loader

**Files:** `apps/ssi-portal/src/app/app.component.ts`, `apps/ssi-portal/src/app/component-behavior.spec.ts`, `apps/ssi-portal/src/app/phase9c-root-ownership.spec.ts`.

1. Record exact base HEAD, dirty-file ownership and reference scan outside this controlled plan. Prove `loadFeatureData()` now performs no I/O or state change for every view, and that `ensureFeatureData()` only caches completion of this no-op. Preserve the Settings reload observable contract: it raises the same notice, does not preload unopened routes, and lazy features reload on their next entry.
2. RED: add a focused architecture assertion that Root no longer declares `loadedFeatureData`, `featureDataLoads`, `featureDataGeneration`, `ensureFeatureData`, or `loadFeatureData`; run the test to observe expected failure. Keep a behavioral test that Settings reload from `/settings` performs no Payment/FIN/SSI request.
3. GREEN: remove the no-op loader/cache and its call sites, replace obsolete cache-internal tests with externally observable behavior assertions, and keep live route-owned reload/refresh behavior unchanged.
4. Run focused Jest, Portal lint/typecheck and `git diff --check` immediately after this code cut. Retain RED/GREEN output under repo-local `tmp/`.

### Task 2: Narrow remaining shared-detail and route callback ownership

**Files:** `apps/ssi-portal/src/app/app.component.ts`, `apps/ssi-portal/src/app/app.component.html` (binding-only changes if needed), route feature files and focused specs only where an actual ownership move requires them.

1. Characterize Dashboard/Checker/Audit shared read-only SSI detail, Currency options, Checker decision, Escape and navigation guards before moving ownership. Do not change the UI layout/template structure or governed maintenance behavior.
2. RED: assert Root does not own SSI detail data fetch or Checker decision/business state. Preserve a separately tested narrow callback/port for the live shared-detail presentation. The current `ReferenceLookupApiService` injection in Root is a real live dependency, not dead code; move it only when equivalent lazy-route behavior and cold-start evidence are proven.
3. GREEN: move data loading and business command to the owning feature/typed port, leaving Root only composition/presentation wiring. Do not create a universal facade or route callback to `AppComponent` from lazy features. Keep `canDeactivate`, WIP cancel/release, concurrent deactivation, late-release and alerts byte-for-byte behavioral parity.
4. Run affected tests and Portal lint/typecheck after each production edit. If ownership cannot move without another presentation extraction, stop this task and report the explicit Product Owner no-template-extraction conflict; do not silently weaken the 9C criterion.

### Task 3: Final Root architecture gate and acceptance

1. Verify direct Root `HttpClient` = 0; Root Payment/FIN/SSI facade ownership = 0; feature→`AppComponent` injection/import = 0; unentered lazy-feature API/chunk count = 0. Distinguish the Phase 10 Swift Data host exception from any 9C ownership claim.
2. Run complete no-cache `npm run verify`, production build/chunk evidence, isolated allowlisted browser route smoke, SSI WIP/navigation/late-release smoke and `git diff --check`. Non-Angular DB/fixture work is out of scope and cannot become an Angular refactor blocker.
3. Stage only reviewed 9C files, create a local candidate commit on `refactor` with no Push, then obtain independent Checker and distinct QA against the exact commit and non-Git evidence identities. Report PASS/CORRECT/HOLD honestly; do not start Phase 10 automatically.

**Scope exclusions:** no `SwiftDataCrudComponent` code change, no DB/seed/API/business-rule change, no new branch, no `app.component.html` presentation extraction for LOC, no universal Page Definition / maintenance adapter.
