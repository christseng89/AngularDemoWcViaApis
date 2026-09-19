# Phase 9B Payment / FIN Root Closure Implementation Plan

> **For Codex:** Execute the RED → Green → Refactor tasks in order on the already-authorized `refactor` working tree. Do not create a branch or push.

**Goal:** Remove Payment and FIN business ownership from `AppComponent` while preserving the existing Payment, Treasury and Trade Finance routed workbenches, request contracts and behavior.

**Architecture:** The live `/resolution/*` routes already lazy-load `ResolutionRouteComponent`, which hosts the parameter-driven `PageDefinitionIndexWorkspaceComponent`. The large Payment/FIN state and commands in `AppComponent` appear to be an older, unrendered implementation; do not move them into a new God facade. Prove every old entry point is unreachable from production UI/route code, characterize the live workbench, then retire the superseded Root code and its obsolete tests. Keep the `ResolutionPageDefinition` pattern separate from SSI maintenance `x-ui-resources`.

**Tech Stack:** Angular standalone lazy routes, signals, Jest, Nx, TypeScript.

---

### Task 1: Freeze live behavior and dead-code proof

**Files:** `apps/ssi-portal/src/app/app.routes.ts`, `apps/ssi-portal/src/app/resolution-route.component.ts`, `apps/ssi-portal/src/app/resolution-workbench/page-definition-index-workspace.component.spec.ts`, `apps/ssi-portal/src/app/component-behavior.spec.ts`.

1. Add or extend tests that prove the three `/resolution/*` URLs lazy-load the same route component with their distinct business-domain data, and that active-route Refresh calls the Page Definition loader.
2. Run the focused Jest tests and retain RED evidence for any missing assertion.
3. Check all production references to each Root Payment/FIN field/command (`rg` excluding specs). Record whether the only callers are within `AppComponent` and whether any shell or route callback crosses into them.
4. Preserve behavioral assertions for live Page Definition navigation, lookup, resolve, confirmation, evidence, error, cancellation and API ordering/payload before removing any old test.

### Task 2: Retire superseded Root Payment/FIN ownership

**Files:** `apps/ssi-portal/src/app/app.component.ts`, `apps/ssi-portal/src/app/component-behavior.spec.ts`, plus a focused architecture spec under `apps/ssi-portal/src/app/`.

1. Write a failing architecture assertion that Root does not import/inject Payment Settlement, FIN Resolution or the SSI read port and does not own Payment/FIN mutable state or business operations. `ReferenceLookupApiService` is a shared-detail exception: Root currently uses its currencies response for live read-only SSI/Checker detail and routed Audit options, so preserve that behavior rather than falsely classifying the entire service as Payment/FIN dead code.
2. Remove only the proven-unreachable Root implementation and obsolete tests that exercised that implementation directly. Keep or relocate equivalent assertions for the live workbench; never weaken a live behavioral oracle to obtain PASS.
3. Remove the obsolete `enterFinResolution` navigation mutation and `ensureTagSsiSelection` SSI-refresh callback only after proving their targets are unrendered. Retain Root Escape delegation to active Maintenance WIP and live shared-detail close; the lazy Resolution workbench has its own Escape handling. Preserve visible shell notices, WIP guard and route semantics.
4. Run affected Jest tests, Portal typecheck and lint after each code edit; retain the RED→Green evidence.

### Task 3: Verify lazy ownership and exact candidate

**Files:** `apps/ssi-portal/src/app/app.routes.ts` and focused tests only if a real wiring defect is demonstrated.

1. From `/settings`, prove Payment/FIN feature code and HTTP services are not instantiated and Payment/FIN API request count is zero; entering each route loads only its required feature/chunk.
2. Exercise Payment, Treasury and Trade Finance navigation, lookup, resolve, confirmation, evidence and errors in an allowlisted isolated browser environment. Preserve exact API count/order/payload and WIP navigation behavior.
3. Run focused tests, Portal lint/typecheck/production build, full no-cache `npm run verify` and `git diff --check`. An unrelated DB/environment failure is reported separately and does not block the Angular scope by itself.
4. Obtain distinct independent Checker and QA review of the exact local candidate commit, then report 9B disposition. Do not push; do not start 9C or Phase 10.

**Scope exclusions:** No more `app.component.html` presentation extraction, no SSI 9A ownership change, no Payment/FIN business-rule/API/fixture/seed/DB change, and no `SwiftDataCrudComponent` refactor.

**Important parity boundary:** Old Root tests directly invoke `/settlements/resolve` followed by `/confirm`, but those methods are not reachable from the current routed UI. The live governed Page Definition route uses one OAS-selected `execute` POST. Record this difference explicitly; old direct-Root confirmation tests do not prove live-route confirmation behavior. Before deleting them, add routed vertical evidence for index → definition → governed lookup → execute, including request order/payload and result/evidence/error. Do not invent a second confirmation step or silently claim the two flows have identical API sequences.

### Initial characterization checkpoint — 2026-09-19

- Base `refactor` HEAD identity was checked and is retained in external task handoff evidence, not embedded in this controlled plan. No branch, commit or push created in this checkpoint.
- Independent read-only checker confirmed the live lazy routes and the old Root implementation are distinct. The checker identified three Root side effects to disposition (`enterFinResolution`, `ensureTagSsiSelection`, old Escape overlay branches), and a live shared-detail consumer of `ReferenceLookupApiService` that must be retained or relocated. This is an audit finding, not a Phase 9B approval.
- Added `page-parameter.client.spec.ts` to characterize the current live transport order and exact OAS-selected execute payload. Focused Jest PASS, file ESLint PASS, Portal app typecheck PASS. The standalone `tsconfig.spec.json` check has numerous pre-existing diagnostics in other specs and none in this new spec; it is not the project Gate.
- Full no-cache `npm run verify` PASS with `NX_DAEMON=false`, `NX_PARALLEL=1`, `NX_SKIP_NX_CACHE=true` when the Angular builder had permission to read workspace source. The first sandboxed build attempt failed with `Access is denied` for unchanged source/CSS; no implementation or fixture was altered for the successful rerun. All eight typecheck targets, eight test targets and five build targets passed. Nx reported `ssi-service:test:ci` flaky, but its target passed.
- **Not yet done:** routed browser vertical characterization, Root legacy retirement, cold-start Payment/FIN evidence, exact-candidate 4-eyes and QA. Phase 9B remains `IN_PROGRESS`, not PASS.

### Root ownership cut and pre-commit verification checkpoint — 2026-09-19

- The live `/resolution/payment`, `/resolution/treasury` and `/resolution/trade-finance` lazy routes remain unchanged. `AppComponent` no longer owns `PaymentSettlementApiService`, `FinResolutionApiService`, the SSI resolution read port, Payment/FIN mutable state, or legacy Payment/FIN commands. The obsolete Root-to-SSI index-refresh callback was removed without changing WIP lifecycle logic. `ReferenceLookupApiService` remains in Root solely for live shared SSI/Checker detail and Audit currency behavior.
- RED→Green architecture assertions are in `phase9b-root-ownership.spec.ts`. The 16 removed direct-Root Payment/FIN tests characterized the superseded, unrendered flow; mixed SSI assertions were retained. The live route's index → definition → governed lookup → OAS-selected execute transport is characterized in `page-parameter.client.spec.ts`. Do not equate this with the retired Root `/settlements/resolve → confirm` flow or invent a confirmation request.
- Full no-cache `npm run verify` exited 0 after the ownership cut: lint, all eight typecheck targets, all eight test targets and all five build targets PASS. Portal suite: 78 suites / 556 tests PASS. `git diff --check` PASS. The Nx flaky-task notice for `ssi-service:test:ci` was informational; the target passed.
- Synthetic isolated-browser vertical smoke for all three domains PASS: GET index → GET definition → governed bank-service lookup → POST execute → visible resolution result; exact POST definition/scenario/fixture/contract identity and values captured. Cold `/settings` has zero Resolution/settlement/FIN API requests and does not load the compiled Resolution lazy chunk; entering a Resolution route does load it. Unexpected or non-allowlisted API requests: 0. This is Angular route/transport QA with synthetic responses, not production-backend or DB-fixture UAT. Transient script identity: `tmp/phase9b-root-cut/browser-resolution-smoke.cjs`, SHA-256 `8B638F56987AF831E704B482D21A4408AFC0B1231C54665CEB25D234CDCF3FC6`.
- The pre-existing Settings runtime service emits one `http://localhost:3100/api/settings/runtime` URL on cold `/settings`. The browser harness intercepts and fulfills that exact request; requests actually reaching 3100/3101: 0. No Payment/FIN request is sent there. Every other 3100/3101 URL remains forbidden. This Settings behavior is not modified or claimed as a global zero-emission result.
- Existing SSI WIP/canDeactivate/late-release browser smoke PASS, including fail-closed cancel and late-release notice; transient script identity: `tmp/angular-refactor-phase-9/browser-routing-smoke.cjs`, SHA-256 `B760ED71CB7A14E30D6E03FC7EB738671E23580516DC3BF16CC0DE9CFC1176D1`.
- Independent read-only Checker reviewed the Root cut and independently reran 61 focused tests plus both browser smokes: code/behavior PASS. Formal Four-eyes disposition remains pending creation and recheck of the **exact local candidate commit**; no push is authorized. Do not treat this pre-commit checkpoint as final 9B closure.
