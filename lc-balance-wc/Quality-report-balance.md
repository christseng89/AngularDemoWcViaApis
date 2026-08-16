# Balance Component — Code Quality Report

**Scope:** `lc-balance-wc/` — Angular app (`src/app/`), Node.js 中台 orchestrator (`backend/`), and the
Balance Component microservice (`microservices/balance-component/`).
**Method:** static/structural review (dependency audit, pattern/security sweep, complexity and duplication
measurement, test-suite execution) — not an exhaustive manual line-by-line business-logic re-derivation.
Every finding below is backed by a command or grep result actually run against this repository on the
review date; none are assumed or templated.
**Review date:** 2026-08-16
**Reviewer posture:** external SonarQube-style quality gate, applied to a project whose own `CLAUDE.md`
describes it as a demo/prototype (v0.1.0, single-day-sprint history) — findings are rated on their own
technical merit, and the final verdict is explicit about prototype-vs-production framing rather than
silently assuming one or the other.

---

## Overall Quality Score

| Dimension | Rating | Notes |
|---|---|---|
| **Reliability** | A (4.7/5) | 636/636 tests passing across 3 independent suites; no logic bugs found in this review's scope. |
| **Security** | C (2.6/5) | No injection/secrets exposure; parameterized SQL. But: 8 High CVEs in prod Angular deps, zero authentication anywhere, permissive CORS. |
| **Maintainability** | C (2.9/5) | One severe God-Component outlier (2,786 lines) drags an otherwise well-documented, strict-mode codebase down. |
| **Coverage** | A (5/5) | All 3 suites clear a 90% floor on statements/branches/functions/lines. |
| **Duplication** | B (3.6/5) | Concentrated in one 32-instance hotspot, not spread through the codebase. |

### Composite score: **73 / 100 (C+ / B-)**

**Final assessment: CONDITIONAL PASS** — sound for its stated purpose (an internally-used
prototype/demo) **and** for continued development under the project's own test-and-docs-sync rule. It is
**NOT production-ready as-is**: §1 (no authentication) and §2 (dependency CVEs) are release blockers for
any deployment handling real trade-finance data, independent of how good the rest of the codebase is.
See [Gate Conditions](#gate-conditions-before-any-production-consideration) at the end.

---

## Table of Findings (priority order)

| ID | Severity | Category | Title |
|---|---|---|---|
| [BAL-001](#bal-001) | 🔴 Blocker | Vulnerability | No authentication/authorization anywhere in the microservice |
| [BAL-002](#bal-002) | 🟠 Critical | Vulnerability | 8 High-severity CVEs in production Angular dependencies |
| [BAL-003](#bal-003) | 🟠 Critical | Code Smell | `transaction-builder.component.ts` is a 2,786-line God Component |
| [BAL-004](#bal-004) | 🟡 Major | Vulnerability | Moderate CVE in microservice's `uuid` dependency |
| [BAL-005](#bal-005) | 🟡 Major | Code Smell | Identical error-formatting expression duplicated 32× |
| [BAL-006](#bal-006) | 🟡 Major | Code Smell | Weak typing (`any`) at the client↔server API boundary |
| [BAL-007](#bal-007) | 🟡 Major | Technical Debt | SQLite whole-file locking blocks per-instrument concurrency |
| [BAL-008](#bal-008) | 🔵 Minor | Security Hotspot | Backend CORS allows any origin |
| [BAL-009](#bal-009) | 🔵 Minor | Security Hotspot | No security headers or rate limiting on either Express service |
| [BAL-010](#bal-010) | 🔵 Minor | Code Smell | No ESLint/Prettier configured anywhere in the three sub-projects |
| [BAL-011](#bal-011) | 🔵 Minor | Code Smell | Hand-rolled schema migration instead of a migration tool |
| [BAL-012](#bal-012) | 🔵 Minor | Code Smell | Test-only internals attached to the Express `app` export |
| [BAL-013](#bal-013) | ⚪ Info | Reliability | One line of provably-dead defensive code |
| [BAL-014](#bal-014) | ⚪ Info | Design Risk | Two independently-maintained domain-enum sources of truth |
| [BAL-015](#bal-015) | ⚪ Info (positive) | — | SQL access is fully parameterized — no injection risk found |
| [BAL-016](#bal-016) | ⚪ Info (positive) | — | Test coverage clears 90% on all four metrics, all three suites |
| [BAL-017](#bal-017) | ⚪ Info (positive) | — | Strict TypeScript compiler flags enabled project-wide |

---

## Vulnerabilities & Security Hotspots

### BAL-001
**No authentication/authorization anywhere in the Balance Component microservice** — 🔴 Blocker (if deployed beyond prototype use)

**Evidence:** `grep -r "jwt|passport|express-session|authenticate(|Authorization" microservices/balance-component/src` returns **zero matches**. Every Maker/Checker field —
`createdBy`, `releasedBy`, `acknowledgedBy`, `cancelledBy` (`src/types.ts`, `src/service/balanceService.ts`)
— is a free-text string the caller supplies on the request body. Nothing verifies the caller is who they
claim to be, nothing prevents a "Maker" and "Checker" from being the same unauthenticated HTTP client.

This is a **known, explicitly accepted scope decision**, not an oversight — `lc-balance-wc/CLAUDE.md`'s
own decision log records: *"Maker=Checker segregation is a system-authorization concern, out of Balance
Component's own scope"* (business instruction 2026-08-14). The finding here is not that the decision was
wrong for a prototype; it's that a **4-eyes control whose entire integrity model depends on knowing who
acted has no way to actually know who acted**, and nothing in the codebase currently gates this behind an
environment flag or a loud runtime warning that would stop it from being deployed as-is.

**Recommended remediation:** before any non-prototype use — front the microservice with real
authentication (even a shared-service-account JWT is a large improvement over nothing), derive
`createdBy`/`releasedBy`/etc. from the verified identity server-side rather than trusting the request
body, and add a startup check that refuses to boot outside a `NODE_ENV=development`/`demo` guard without
an auth provider configured.

---

### BAL-002
**8 High-severity CVEs in production Angular dependencies** — 🟠 Critical

**Evidence** (`npm audit --omit=dev` from `lc-balance-wc/`, production dependencies only):

```
Angular: Template and Attribute Namespace Sanitization Bypass (XSS)   — GHSA-f3m7-gqxr-g87x
@angular/core: Dynamic Component Namespace Bypass leading to XSS       — GHSA-692r-grfm-v8x7
Angular Client Hydration DOM Clobbering & Response-Cache Poisoning     — GHSA-rgjc-h3x7-9mwg
Angular i18n: Cross-Site Scripting (XSS) via event-handler attributes  — GHSA-jj27-h5hq-8x99
8 high severity vulnerabilities (npm audit --omit=dev)
```

All four advisories affect `@angular/core@17.3.x`/`@angular/animations@17.3.x` and are genuine
runtime-affecting XSS/cache-poisoning classes, not build-tooling noise. `npm audit fix --force` reports
the fix requires upgrading to `@angular/core@22.1.2` — a breaking major-version jump (Angular 17 → 22),
consistent with these CVEs having been fixed several major versions downstream.

**Recommended remediation:** schedule an Angular major-version upgrade (17→22 in whatever incremental
steps `ng update` supports) as its own tracked piece of work — not a drive-by patch, given the breaking
surface — and re-run `npm audit --omit=dev` after each step to confirm the advisories actually clear
rather than merely silence via `overrides`.

*(Separately, `npm audit` with dev dependencies included reports 50 findings — 1 critical (`tar`), 30
high — all inside the Angular CLI/`@angular-devkit/build-angular` build toolchain (webpack/vite/pacote/
node-gyp transitively). These affect the local build environment, not what ships to a browser or server,
and are typical for any current Angular CLI project; tracked here for completeness but not counted toward
the Critical rating above.)*

---

### BAL-004
**Moderate CVE in the microservice's `uuid` dependency** — 🟡 Major

**Evidence:** `npm audit` inside `microservices/balance-component/`:

```
uuid  <11.1.1
Severity: moderate
uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided — GHSA-w5hq-g745-h8pq
fix available via `npm audit fix --force` (uuid@14.0.1, breaking change)
```

Lower urgency than BAL-002 (moderate, single package, and the affected code path — a caller-supplied
output buffer — isn't exercised anywhere in this codebase's own use of `uuid`), but still an open,
patchable advisory.

**Recommended remediation:** `npm audit fix --force` in `microservices/balance-component/`, then run
`npm test` to confirm the major-version bump doesn't change ID-generation behavior any caller depends on.

---

### BAL-008
**Backend CORS configured to allow any origin** — 🔵 Minor

**Evidence:** `backend/server.js`:
```js
const app = express();
app.use(cors());   // no options — reflects/allows every Origin
```
No sensitive data or authentication token flows through this endpoint today (it only proxies to the
equally-unauthenticated microservice), so the practical risk is low right now. It becomes a real exposure
the moment any credential or PII is added to this flow without someone remembering to also lock down CORS.

**Recommended remediation:** pass an explicit `origin` allow-list (`http://localhost:4200` for dev, the
real deployed origin otherwise) to `cors({ origin: [...] })`.

---

### BAL-009
**No security headers or rate limiting on either Express service** — 🔵 Minor

**Evidence:** `grep -ri "helmet|x-frame-options|content-security-policy|rate-limit" microservices/balance-component/src backend` (excluding `node_modules`) returns no hits in either service's own source. Neither
`app.ts` (microservice) nor `server.js` (backend) sets any response security headers or caps request
rate/body size beyond Express's own defaults.

**Recommended remediation:** add `helmet()` to both Express apps (cheap, no functional change) and a
basic rate limiter (`express-rate-limit`) on the microservice's mutating endpoints
(`POST /balance-movements` and its lifecycle actions) before any internet-facing deployment.

---

## Code Smells & Maintainability

### BAL-003
**`transaction-builder.component.ts` is a 2,786-line God Component** — 🟠 Critical

**Evidence:**
```
$ wc -l src/app/transaction-builder/transaction-builder.component.ts
2786 src/app/transaction-builder/transaction-builder.component.ts

$ grep -c "^  get [a-zA-Z]*(" src/app/transaction-builder/transaction-builder.component.ts
34   # plain `get` accessors alone

$ grep -o "if (\|else if\|&&\|||\| ? \|case " src/app/transaction-builder/transaction-builder.component.ts | wc -l
369  # decision points — a rough cyclomatic-complexity proxy
```
One class owns: function/side selection, three independently-paginated catalog/parent/IB-index pickers,
natural-key search with a dual-instrument fallback, the Maker `submit()` dispatch across all 14 named
business functions (A1–A9, B1–B5; `submit()` alone is ~430 lines), the Checker's compound
release/reject/acknowledge/cancel logic (`release()` alone is ~195 lines), and the entire Look Up panel
(LC/Acceptance/SG tabs). This is well past any Single Responsibility boundary a SonarQube "Class
Complexity"/"File Complexity" gate would flag, and it is the direct root cause of BAL-005 and a
contributor to BAL-006 below — a file this size and this dense is exactly where duplicated snippets and
loosely-typed escape hatches accumulate.

To be clear about what's *good* here: the size is a symptom of thoroughness, not sloppiness — every
branch is dated and cited to a specific business instruction (per this project's own `CLAUDE.md`
convention), and the file now has three dedicated spec files plus a fourth gap-closing one achieving
~99.6% statement coverage on it. The complexity is real and load-bearing domain logic, not accidental
bloat — which makes it harder, not easier, to safely decompose.

**Recommended remediation:** extract by concern, in priority order: (1) a shared `CatalogPagingService`
or directive for the three near-identical paginated-picker state machines (catalog/parent/IB-index each
reimplement page/total/prevPage/nextPage); (2) a `ChecklistActionsComponent` (or service) for
submit/release/reject/cancel/acknowledge, taking the resolved `TransactionFunction` + model as input
rather than reaching into the host component's own fields; (3) a standalone `LookupPanelComponent` for
the LC/Acceptance/SG tabs, which are already fairly self-contained. Do this incrementally, one extraction
per PR, re-running the full 90%-gated suite after each (per this project's own standing rule) — not as
one large rewrite.

---

### BAL-005
**Identical error-formatting expression duplicated 32 times** — 🟡 Major

**Evidence:**
```
$ grep -rn "\.error?\.message ?? String(" src/app --include="*.ts" | grep -v spec | wc -l
32
```
Every one of `transaction-builder.component.ts`'s ~15 API-calling methods repeats the same inline
expression — `err.error?.message ?? String(err)` — to turn an HTTP error into a display string (e.g.
`submitError = err.error?.message ?? String(err);`, `searchError = ...`, `checkerError = ...`). Harmless
individually, but a genuine SonarQube-flagged duplication once repeated this many times: a future change
to error-message formatting (e.g. surfacing `err.error.code` alongside the message, or handling a
network-level error distinctly from an HTTP error response) now needs 32 synchronized edits instead of
one.

**Recommended remediation:** extract `private describeApiError(err: unknown): string { return
(err as any)?.error?.message ?? String(err); }` once, and call it from all 32 sites. Zero behavior
change, one clear place to enhance later.

---

### BAL-006
**Weak typing (`any`) at the client↔server API boundary** — 🟡 Major

**Evidence:**
```
$ grep -c ": any\|<any>\|as any\|any\[\]" src/app/transaction-builder/balance-component-api.service.ts
10
$ grep -c ": any\|<any>\|as any\|any\[\]" src/app/transaction-builder/transaction-builder.component.ts
42
```
`balance-component-api.service.ts` types 8 of its 9 methods' return values as `Observable<any>` or
`Observable<any[]>` (`createMovement`, `release`, `reject`, `cancel`, `acknowledge`, `listMovements`, and
others) — only `resolveContract`/`catalog`/`getSnapshot` carry a real interface. `transaction-builder.component.ts` then propagates that into 42 of its own `any`-typed fields
(`payableMovements: any[]`, `submitResult: any`, `checkerItems: any[]`, etc.). This defeats TypeScript
`strict: true` (BAL-017) for precisely the data most likely to drift out from under the client — the
server's own response shape — and is exactly the class of gap that produces a runtime `undefined` access
no compiler catches.

**Recommended remediation:** define response interfaces mirroring the microservice's own `types.ts`
(`BalanceMovementResponse`, `ReleaseResult`, etc. — the microservice already has these shapes typed
server-side; this is a matter of sharing/re-declaring them client-side, not inventing new ones) and
replace the `Observable<any>` signatures. Do this incrementally per-method rather than all at once, since
each will surface currently-hidden shape mismatches that need individual triage.

---

### BAL-010
**No ESLint/Prettier configured anywhere in the three sub-projects** — 🔵 Minor

**Evidence:** `find . -iname ".eslintrc*" -o -iname "eslint.config.*" -o -iname ".prettierrc*"` (excluding
`node_modules`) returns nothing in `lc-balance-wc/`, `lc-balance-wc/backend/`, or
`lc-balance-wc/microservices/balance-component/`. Code-style and a large class of code-smell enforcement
(unused variables, needless complexity, inconsistent formatting) currently relies entirely on
TypeScript's own compiler diagnostics plus manual review — there's no automated gate a CI pipeline could
run today to catch a style regression or a common smell pattern before merge.

**Recommended remediation:** add a baseline `eslint.config.js` (flat config, matching Angular 17/ESLint 9
conventions) with `@typescript-eslint/recommended` + `@angular-eslint`, and a `.prettierrc`. Given
BAL-006's existing `any` count, configure `no-explicit-any` as a *warning* initially (not an error) so it
surfaces the debt without blocking unrelated work.

---

### BAL-011
**Hand-rolled schema migration instead of a migration tool** — 🔵 Minor

**Evidence:** `microservices/balance-component/src/db/index.ts` performs its `acknowledged_by`/
`acknowledged_at` column addition via an inline, one-off `ALTER TABLE` check-and-run at connection time,
rather than a versioned migration framework. Functionally correct today (already covered by
`test/unit/db/index.test.ts`'s re-open/migration-no-op case per this project's own test suite), but every
future schema change will need the same hand-written "does this column already exist" guard, and there's
no migration history/rollback path.

**Recommended remediation:** not urgent at the current schema size — but before the next schema change,
consider a lightweight migration runner (even a simple numbered-SQL-files-in-a-folder approach) rather
than adding a third inline `ALTER TABLE` guard.

---

### BAL-012
**Test-only internals attached to the Express `app` export** — 🔵 Minor

**Evidence:** `backend/server.js`:
```js
module.exports = app;
module.exports.runCase = runCase;
module.exports.resolveLogicalContractId = resolveLogicalContractId;
module.exports.callMicroservice = callMicroservice;
```
This works (Express apps are callable functions, so extra properties can be attached), and was a
deliberate, documented choice made this session specifically to close a test-coverage gap without
fabricating registry data. It's flagged here only because it mixes an HTTP handler's public surface with
a test-only seam on the same object — a reader importing `server.js` in production code has no signal
that `.runCase`/`.resolveLogicalContractId` exist purely for `backend/test/runCase.test.js`.

**Recommended remediation:** low priority; if this file grows further, consider `module.exports = { app,
runCase, resolveLogicalContractId, callMicroservice };` instead, updating the two callers (`server.test.js`'s `request(app)` and the direct-import test) accordingly.

---

## Reliability & Design Risk

### BAL-013
**One line of provably-dead defensive code** — ⚪ Info

**Evidence:** `microservices/balance-component/src/domain/balanceDerivation.ts`, `computeFaceAmount`'s
`direction === undefined` throw is unreachable because `FACE_AMOUNT_MOVEMENT_TYPES` is a strict subset of
`MOVEMENT_DIRECTION`'s own keys — already identified and left intentionally uncovered (rather than
force-tested) by this project's own test suite, with the reasoning documented inline. Re-surfaced here
only because a SonarQube-style scan would flag it as unreachable code; the existing team judgment (leave
it as a same-file invariant guard, don't delete or fake-cover it) is reasonable and this report doesn't
recommend changing it.

---

### BAL-014
**Two independently-maintained domain-enum sources of truth** — ⚪ Info

**Evidence:** `src/app/transaction-builder/balance-component.model.ts` (Angular) and
`microservices/balance-component/src/types.ts` (server) each independently declare the `InstrumentType`
union and the legal-movementType-per-instrument tables. This is architecturally normal for a
decoupled client/server pair (not code duplication in the copy-paste sense — different languages,
different files, appropriately so), but it is a schema-drift risk class: nothing currently detects if one
side adds/renames an `InstrumentType` value without the other following. Not a defect today (the two are
in sync as of this review), just a risk worth naming.

**Recommended remediation:** not urgent given the low current change frequency, but if this pair drifts
apart again, a small contract test (Angular's own registry values are all accepted by the server's own
`requestSchema.ts`) would catch it cheaply.

---

## Positive Findings

### BAL-015
**SQL access is fully parameterized — no injection risk found.** Every query in `src/store/*.ts` uses
`db.prepare()` with `?`/`@named` binds, including the dynamically-assembled `WHERE` clause in
`balanceContractStore.ts`'s `listCatalog()` (lines 208–241) — the clause *fragments* are hardcoded
literals chosen from a fixed set of conditions in code, never derived from caller input, and every actual
*value* (including the `LIKE`-wildcard search string) goes through a bound parameter. This is the correct
pattern and was verified by reading the implementation, not assumed from good intentions.

### BAL-016
**Test coverage clears 90% on all four metrics, across all three independent suites**, 636 tests total,
all green as of this review (`npm test` exit code 0 in each of the three directories):

| Suite | Statements | Branches | Functions | Lines | Tests |
|---|---|---|---|---|---|
| `microservices/balance-component/` | 96.46% | 90.41% | 100% | 99.76% | 172 |
| `backend/` | 96.8% | 94.44% | 95.45% | 96.51% | 26 |
| Angular app (`src/app/`) | 99.68% | 90.11% | 99.66% | 99.82% | 438 |

### BAL-017
**Strict TypeScript compiler flags enabled project-wide** — both `lc-balance-wc/tsconfig.json` and
`microservices/balance-component/tsconfig.json` set `strict: true` plus `noImplicitOverride`,
`noPropertyAccessFromIndexSignature`, `noImplicitReturns`, and `noFallthroughCasesInSwitch`. This is a
materially stronger baseline than a typical Angular CLI default, and is what makes BAL-006's `any` count
worth fixing — the type system is otherwise doing real work everywhere it's actually engaged.

---

## Gate Conditions Before Any Production Consideration

This codebase earns its **CONDITIONAL PASS** for continued prototype/demo development as-is. Before this
project (or any component of it) is considered for a deployment handling real trade-finance data or
real user credentials, the following are non-negotiable, in this order:

1. **BAL-001** — real authentication, with `createdBy`/`releasedBy`/etc. derived server-side from a
   verified identity, not trusted from the request body.
2. **BAL-002** — Angular upgraded off the CVE-affected 17.3.x line.
3. **BAL-004, BAL-008, BAL-009** — dependency patch, CORS allow-list, security headers + rate limiting.

None of the Maintainability findings (BAL-003, BAL-005, BAL-006, BAL-010–BAL-012) block a production
decision on their own, but BAL-003 in particular will make every future change to the Transaction Builder
riskier and slower until addressed, and should be scheduled independently of any production timeline.

Per this project's own standing rule (`lc-balance-wc/CLAUDE.md`): any remediation work here must come with
matching test updates and must leave all three suites passing at their 90% floor before being considered
complete.
