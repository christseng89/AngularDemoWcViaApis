# Angular Refactor Phase 5 Resolution Lazy Routes Implementation Plan

> For Codex: execute test-first in this isolated task worktree; retain independent exact-commit review before integration.

**Goal:** Move the already standalone, `ResolutionPageDefinition`-driven Payment, Treasury, and Trade Finance workspace behind real Angular lazy routes without changing its API/domain orchestration or the existing WIP navigation protection.

**Architecture:** Add one thin route host that binds governed `businessDomain` route data to `PageDefinitionIndexWorkspaceComponent`. Register `/resolution/payment`, `/resolution/treasury`, and `/resolution/trade-finance` with `loadComponent` and the existing guard. Generalize the AppComponent Router bridge established in Phase 4 so those paths use guard-before-view/storage commits; leave Maker, Checker, Audit, SwiftDataCrud, and the legacy root in place. Do not combine the `ResolutionPageDefinition` adapter with `x-ui-resources` maintenance.

**Tech Stack:** Angular 22 standalone Router/Signals, TypeScript 6, Jest 30, Nx 23.

**Base:** `refactor` commit `6cc2cffca4f30eaf13ddd9f406dc3a487fe7849c`; task branch `codex/angular-refactor-phase5-resolution` in the isolated project-local worktree. No DB/fixture/seed/production data changes. Unrelated DB/environment failures are classified separately and never mislabeled PASS.

---

### Task 1: Characterize route and domain binding (RED)

**Files:**

- Modify `apps/ssi-portal/src/app/app.routes.spec.ts`.
- Create `apps/ssi-portal/src/app/resolution-route.component.spec.ts`.
- Create after RED `apps/ssi-portal/src/app/resolution-route.component.ts`.
- Modify after RED `apps/ssi-portal/src/app/app.routes.ts`.

Test exact three route URLs, `canActivate` on each, `loadComponent` instead of eager `component`, and route-data-to-host `PAYMENT`/`TREASURY`/`TRADE_FINANCE` binding. Run focused Jest once before implementation and retain the failing output under ignored `tmp/angular-refactor-phase-5/`. Implement only the thin route host and route declarations. Re-run focused tests, lint, and Portal typecheck.

### Task 2: Preserve guard-before-commit navigation (RED → GREEN)

**Files:**

- Modify `apps/ssi-portal/src/app/component-behavior.spec.ts` and relevant route/template characterization tests.
- Modify after RED `apps/ssi-portal/src/app/app.component.ts` and `apps/ssi-portal/src/app/app.component.html`.

Test direct URL bootstrap for each domain without unrelated parent API requests; sidebar click and browser history commit only after guard success; WIP denial/cleanup failure leaves URL, view, storage and editor protected; post-guard failure after WIP release converges safely; lazy loading/error uses the shared accessible loading pattern. Extend the Phase 4 path mapping without adding a generic framework or cross-feature state. Remove AppComponent's static `PageDefinitionIndexWorkspaceComponent` import and its `@defer` block, keep `RouterOutlet` mounted and show its routed content only when the corresponding view has committed. Preserve legacy test contracts unless they are explicitly superseded by route-aware behavior, and never weaken WIP assertions.

### Task 3: Verify and independently review

Run focused route and parent behavior tests, full no-cache Portal tests, Portal typecheck/build, lint, `git diff --check`, and the project-standard `npm run verify` once under documented setup. Record the actual whole-project result; unrelated DB/environment failures do not become Angular defects or trigger repeated fixture discovery. Confirm separate route chunks and no resolution API request before the route is entered; compare request count/order/payload with the Phase 4 characterization. Have an Independent Checker review the working tree, then stage only Phase 5 files, local commit, and obtain exact-commit independent QA. Do not fast-forward `refactor`, merge, or push without a separate controlled integration decision.
