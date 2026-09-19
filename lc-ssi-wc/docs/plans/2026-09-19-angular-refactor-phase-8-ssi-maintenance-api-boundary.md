# Angular Refactor Phase 8 SSI Maintenance API Boundary Implementation Plan

> For Codex: execute Red → Green → Refactor directly on `refactor` under the Product Owner's explicit branch instruction; obtain independent exact-commit review before closure.

**Goal:** Remove direct SSI Maintenance HTTP calls from `AppComponent` without changing Maker/WIP behavior, request URL/order/body, or page presentation.

**Architecture:** Add an HTTP-only `SsiMaintenanceApiService` for SSI list/summary and lifecycle commands. Keep query parameters, page normalization, lifecycle choices, UI state, WIP cleanup and error presentation in the current parent until a later feature slice. Do not create a God Facade or combine `x-ui-resources` with `ResolutionPageDefinition`.

**Tech Stack:** Angular 22, TypeScript 6, Jest 30, Nx 23.

**Base:** `refactor` commit `8681ae1c38253ab0435725b59bf628837d2d78c5`; no new branch, no Push; no backend, DB, seed, fixture, OAS, styles or `SwiftDataCrudComponent` edits. The Product Owner's Angular-only non-interference rule remains in force.

---

### Task 1: Characterize transport (RED)

Create `apps/ssi-portal/src/app/ssi-maintenance-api.service.spec.ts`. First assert the exact existing SSI list/summary GETs, Maker draft POST/PUT, submit/approve POST, revise reservation POST, cancel-revision POST, revoke DELETE body, and suppression POST. Run the focused test before production code and retain expected RED evidence in ignored `tmp/angular-refactor-phase-8/`.

### Task 2: Extract HTTP-only service (GREEN)

Create `ssi-maintenance-api.service.ts` with typed public methods and no signals, UI state, `firstValueFrom`, lifecycle policy or error strings. Wire it into `AppComponent` via Angular injection. Move only the nine direct SSI HTTP call sites; retain existing `Promise.all` concurrency, request sequence guard, WIP fail-closed handling, query construction, page assertions and notices. Extend parent behavior tests if any boundary is not characterized.

### Task 3: Refactor and verify

Prove by reference scan that direct parent SSI `/ssis` transport calls are gone and service is the sole owner of those URLs, while Checker feature remains separate. Run focused and full Portal tests, lint, Portal typecheck/build, `git diff --check`, full no-cache `npm run verify`, and isolated browser smoke for Maker/WIP request parity if feasible. Do not label mocked browser traffic as live API QA.

### Task 4: Candidate and four-eyes

Stage only Phase 8 Angular files and this plan, create a local candidate commit on `refactor`, no Push. An independent Checker reviews the exact commit and evidence. Phase 8 closes only on a PASS verdict; report NOT_EXECUTED scopes explicitly.
