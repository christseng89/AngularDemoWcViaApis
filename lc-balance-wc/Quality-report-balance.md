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
| **Security** | C+ (3.0/5) | No injection/secrets exposure; parameterized SQL; the one patchable CVE found (BAL-004) is now fixed. 8 High CVEs in prod Angular deps and zero authentication remain, both deliberately deferred (see Remediation Status). |
| **Maintainability** | B- (3.4/5) | The God-Component outlier's worst duplication is gone (BAL-005) and its paging logic is now shared (BAL-003, 1 of 3 planned extractions); the class itself is still large — 2 more extractions remain open. |
| **Coverage** | A (5/5) | All 3 suites clear a 90% floor on statements/branches/functions/lines, unchanged after remediation. |
| **Duplication** | A- (4.3/5) | The 32-instance hotspot (BAL-005) is fully eliminated. |

### Composite score: **73 → 79 / 100 (C+ → B-)** — see [Remediation Status](#remediation-status-2026-08-16) below

**Final assessment: CONDITIONAL PASS** — sound for its stated purpose (an internally-used
prototype/demo) **and** for continued development under the project's own test-and-docs-sync rule. It is
**NOT production-ready as-is**: §1 (no authentication) and §2 (dependency CVEs) are release blockers for
any deployment handling real trade-finance data, independent of how good the rest of the codebase is.
See [Gate Conditions](#gate-conditions-before-any-production-consideration) at the end.

---

## Remediation Status (2026-08-16)

Per user instruction, all **Critical** and **Major** findings were addressed in this pass; the sole
**Blocker** (BAL-001) was explicitly left as-is, matching this report's own framing of it as an accepted
prototype-scope decision rather than an oversight. Three items were scoped down deliberately (user-confirmed)
rather than attempted blind, given their size/risk relative to a single remediation pass:

| ID | Severity | Status | What happened |
|---|---|---|---|
| BAL-001 | 🔴 Blocker | **Not actioned (by instruction)** | Left as-is — prototype-scope decision, not in scope for this pass. |
| BAL-002 | 🟠 Critical | **Deferred, documented** | A 5-major-version Angular upgrade (17→~22) was judged too large/risky for a drive-by fix in this pass (real risk of breaking the 438-test suite and Formly/jest-preset-angular compatibility) — user-confirmed to defer rather than attempt blind. Still open; tracked below with the exact CVEs and target version. |
| BAL-003 | 🟠 Critical | **Partially fixed (1 of 3 planned extractions)** | The three duplicated paging state machines (Catalog/Parent LC/IB Index picker) now share one `loadPagedCatalog` helper. Public field/method names the `.html` template binds to are unchanged. The Checker-actions extraction and the Look Up panel extraction remain open, per user-confirmed incremental scope. |
| BAL-004 | 🟡 Major | **Fixed** | `uuid`/`@types/uuid` were unused dependencies (the code already uses `crypto.randomUUID()`) — removed entirely rather than patched. `npm audit`: 0 vulnerabilities. |
| BAL-005 | 🟡 Major | **Fixed** | All 32 occurrences of `err.error?.message ?? String(err)` replaced with a single `describeApiError()` helper. |
| BAL-006 | 🟡 Major | **Fixed at the boundary** | `balance-component-api.service.ts`'s 9 methods are now fully typed (`BalanceMovement`, `HttpResponse<BalanceMovement>`) instead of `Observable<any>`/`any[]`; its 2 remaining `params: any` locals are now `Record<string, string | number>`. The component's own internal `any`-typed fields (the propagated symptom, not the boundary itself) were deliberately left for a future incremental pass, per this report's own original remediation guidance ("do this incrementally per-method... each will surface currently-hidden shape mismatches"). |
| BAL-007 | 🟡 Major (Technical Debt) | **Not actioned (by instruction)** | Needs a full SQLite→PostgreSQL engine swap to actually fix, not a code patch, and no Postgres instance exists in this environment — user-confirmed to leave as already-tracked debt (it's already documented as must-replace-before-production in this project's own `CLAUDE.md`). |

**All three test suites re-verified green after every fix above** (`npm test`, exit 0 in each directory):

| Suite | Statements | Branches | Functions | Lines | Tests |
|---|---|---|---|---|---|
| `microservices/balance-component/` | 96.46% | 90.41% | 100% | 99.76% | 172 (unchanged) |
| `backend/` | 96.8% | 94.44% | 95.45% | 96.51% | 26 (unchanged) |
| Angular app (`src/app/`) | 99.68% | **93.6%** (↑ from 90.11%) | 99.67% | 99.82% | 438 (2 spec assertions updated to match an intentional, behaviorally-identical call-shape change from the BAL-003 extraction — see that section) |

---

## Table of Findings (priority order)

| ID | Severity | Category | Title | Status |
|---|---|---|---|---|
| [BAL-001](#bal-001) | 🔴 Blocker | Vulnerability | No authentication/authorization anywhere in the microservice | Not actioned (by instruction) |
| [BAL-002](#bal-002) | 🟠 Critical | Vulnerability | 8 High-severity CVEs in production Angular dependencies | Deferred, documented |
| [BAL-003](#bal-003) | 🟠 Critical | Code Smell | `transaction-builder.component.ts` is a 2,786-line God Component | Partially fixed (1/3) |
| [BAL-004](#bal-004) | 🟡 Major | Vulnerability | Moderate CVE in microservice's `uuid` dependency | **Fixed** |
| [BAL-005](#bal-005) | 🟡 Major | Code Smell | Identical error-formatting expression duplicated 32× | **Fixed** |
| [BAL-006](#bal-006) | 🟡 Major | Code Smell | Weak typing (`any`) at the client↔server API boundary | **Fixed at boundary** |
| [BAL-007](#bal-007) | 🟡 Major | Technical Debt | SQLite whole-file locking blocks per-instrument concurrency | Not actioned (by instruction) |
| [BAL-008](#bal-008) | 🔵 Minor | Security Hotspot | Backend CORS allows any origin | Open (Minor, out of this pass's scope) |
| [BAL-009](#bal-009) | 🔵 Minor | Security Hotspot | No security headers or rate limiting on either Express service | Open (Minor, out of this pass's scope) |
| [BAL-010](#bal-010) | 🔵 Minor | Code Smell | No ESLint/Prettier configured anywhere in the three sub-projects | Open (Minor, out of this pass's scope) |
| [BAL-011](#bal-011) | 🔵 Minor | Code Smell | Hand-rolled schema migration instead of a migration tool | Open (Minor, out of this pass's scope) |
| [BAL-012](#bal-012) | 🔵 Minor | Code Smell | Test-only internals attached to the Express `app` export | Open (Minor, out of this pass's scope) |
| [BAL-013](#bal-013) | ⚪ Info | Reliability | One line of provably-dead defensive code | Info only, no action needed |
| [BAL-014](#bal-014) | ⚪ Info | Design Risk | Two independently-maintained domain-enum sources of truth | Info only, no action needed |
| [BAL-015](#bal-015) | ⚪ Info (positive) | — | SQL access is fully parameterized — no injection risk found | — |
| [BAL-016](#bal-016) | ⚪ Info (positive) | — | Test coverage clears 90% on all four metrics, all three suites | — |
| [BAL-017](#bal-017) | ⚪ Info (positive) | — | Strict TypeScript compiler flags enabled project-wide | — |

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

**Outcome (2026-08-16): Deferred, documented — not fixed in this pass.** User-confirmed decision: a
5-major-version jump carries real risk of breaking Angular 17.3's control-flow syntax, `@ngx-formly`
compatibility, and `jest-preset-angular` compatibility, with a real chance of leaving the 438-test Angular
suite broken mid-upgrade if attempted as a drive-by fix alongside five other findings. Treated the same
way BAL-001 (the Blocker) was treated — deliberately deferred, not silently skipped. **Follow-up work
needed:** a dedicated `ng update` pass (17→18→…→22, one major version at a time), re-running
`npm audit --omit=dev` and the full Angular test suite after each step, tracked as its own piece of work
separate from routine feature changes.

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

**Outcome (2026-08-16): Fixed — better than the recommended remediation.** Investigation found `uuid`
was never actually imported anywhere in `src/` — `balanceService.ts` uses Node's built-in
`crypto.randomUUID()` instead (line 15, 397, 519, 520). Rather than bump to the breaking `uuid@14`, both
`uuid` and `@types/uuid` were removed from `package.json` entirely — eliminates the CVE with zero
behavior risk, since no code path exercised the vulnerable package at all. Verified: `npm audit` → 0
vulnerabilities; `npm run typecheck` clean; `npm test` → 172/172 passing, coverage unchanged
(96.46/90.41/100/99.76).

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

**Outcome (2026-08-16): Partially fixed — extraction (1) of the three above is done; (2) and (3) remain
open, user-confirmed as follow-up rather than attempted in the same pass.** A new private
`loadPagedCatalog()` helper now holds the shared "call `catalog()`, populate items+total(+snapshots),
clear both on any failure" body that `reloadCatalog()`, `loadParentPage()`, and `loadIbIndexPage()` each
used to reimplement byte-for-byte. Each of the three keeps its own distinct guard condition (Catalog also
blocks on `isCreatingMovement`; IB Index also requires a picked LC Number) and its own public
`page`/`total`/`pageSize` fields, `*TotalPages` getter, and `prevPage()`/`nextPage()` methods completely
unchanged — deliberate, since the `.html` template (not covered by this project's Jest config) binds
directly to those names and a rename would be an unverified, silent risk. `transaction-builder.component.ts`
grew slightly in raw line count (2786→2829, mostly new doc comments) since this consolidates *duplicated
logic paths*, not raw text — the real signal is the branch-coverage jump from 90.11%→93.6% (662/704 vs.
573/769 covered branches) once the three call sites collapsed into one well-exercised implementation.
One test-assertion update was required and made:
`transaction-builder.component.selection.spec.ts`'s two `ibIndexNextPage`/`ibIndexPrevPage` tests
expected `api.catalog(...)` called with 6 positional args (tenorFamily omitted); the shared helper always
passes all 7 (tenorFamily explicitly `undefined` when unset) — behaviorally identical (the method's own
optional parameter reads as `undefined` either way), so the two assertions were updated to match rather
than treated as a regression. Verified: `npx tsc -p tsconfig.app.json --noEmit` clean; `npm test` →
438/438 passing. **Follow-up work needed:** extractions (2) `ChecklistActionsComponent` and (3)
`LookupPanelComponent`, each as its own scoped pass per the original recommendation above.

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

**Outcome (2026-08-16): Fixed, exactly as recommended.** `describeApiError(err: any)` added (colocated
with `formatAmount`, the file's other small display-formatting helper); all 32 call sites — including the
two `fallbackErr`-named ones inside `searchExistingContract`'s dual-instrument-fallback path and
`searchCheckerLc`'s own equivalent — now call `this.describeApiError(...)`. Zero behavior change (the
implementation is character-for-character what was inlined 32 times). Verified:
`grep -c "\.error?\.message ?? String("` → 1 (the helper's own body, correctly not itself a duplicate
call site); `npx tsc -p tsconfig.app.json --noEmit` clean; `npm test` → 438/438 passing.

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

**Outcome (2026-08-16): Fixed at the boundary — the service, not the propagated component fields.** Added
a `BalanceMovement` interface to `balance-component-api.service.ts` mirroring the microservice's own
`src/types.ts` shape (status/movementType/sourceTransactionRef/warnings/acknowledgedAt/etc. — every field
the component actually reads). All 9 of the service's methods are now properly typed:
`createMovement` → `Observable<HttpResponse<BalanceMovement>>` (it already passed `observe: 'response'`;
every call site already destructures `.body`, confirmed via `grep` before typing it), `release`/`reject`/
`cancel`/`acknowledge` → `Observable<BalanceMovement>`, `listMovements` → `Observable<BalanceMovement[]>`.
The 2 remaining `params: any` locals (inside `resolveContract`/`catalog`) became
`Record<string, string | number>` — this tripped the project's own `noPropertyAccessFromIndexSignature`
tsconfig flag (the same TS4111 class the root `CLAUDE.md` already documents for the sibling
`lc-payment-wc` project), fixed by switching to bracket-notation (`params['ibNumber']`) at the 6 affected
assignment sites. **Deliberately not fixed in this pass:** the component's own 42 `any`-typed *fields*
(`payableMovements: any[]`, `submitResult: any`, etc.) — these are the propagated symptom, not the
boundary itself, and retyping them risks surfacing real shape mismatches needing individual triage exactly
as this finding's own original remediation text warned; assigning a now-properly-typed `BalanceMovement`
into an `any`-typed field is always safe, so this fix is additive and creates no new risk, but doesn't
by itself shrink the 42 count. **Follow-up work needed:** retype the component's own fields incrementally,
one field/method at a time, now that the service actually has something real to type them *as*. Verified:
`npx tsc -p tsconfig.app.json --noEmit` clean; `npm test` → 438/438 passing, coverage unchanged.

---

### BAL-007
**SQLite whole-file locking blocks per-instrument concurrency** — 🟡 Major (Technical Debt)

*(This finding was listed in the Table of Findings at the top but its own detail section was missed in
the original pass — added here now for completeness, since a reader following the table's own link
shouldn't hit a dead anchor.)*

**Evidence:** `microservices/balance-component/src/db/index.ts`'s own doc comment, already present before
this review:
> SQLite locks at the whole-database-file level even under WAL — cannot demonstrate true per-instrument
> (per-`logicalContractId`) non-blocking concurrency the way the design doc's §6 requires: *"同一張 LC
> 底下的多筆同時申請會被正確序列化，但不同 LC 之間完全不互相阻塞"* (same-LC writes serialize,
> different-LC writes never block each other) — every write serializes globally regardless of
> `logicalContractId`.

This is not a newly-discovered defect — it's an already-documented, already-accepted limitation
(`lc-balance-wc/CLAUDE.md`'s own decision log flags it as **must-replace** — PostgreSQL row-level
locking — before the design doc's concurrency requirement is actually validated in production). It is
included in this report's findings table because a SonarQube-style scan would independently flag the
same "global lock, no row-level granularity" pattern as a scalability/reliability risk regardless of
whether the team already knows about it — the value of listing it here is confirming it, not discovering
it.

**Recommended remediation:** swap `node:sqlite` for PostgreSQL (`SELECT ... FOR UPDATE` scoped to
`balance_contract_id`) or MySQL/InnoDB row-level locking, per the existing `CLAUDE.md` guidance — this is
a database-engine migration, not a code patch, and needs a real Postgres/MySQL instance to develop and
test against.

**Outcome (2026-08-16): Not actioned, by instruction — confirmed as already-tracked debt.** User-confirmed
decision: attempting a database engine swap without a real PostgreSQL instance available in this
environment to test against would be reckless, and the limitation is already correctly documented (not
silently accepted) in this project's own `CLAUDE.md`. No code change made. Remains exactly the "must
replace before production, not before continued prototype work" status quo the existing documentation
already states.

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
| Angular app (`src/app/`) | 99.68% | 93.6% (post-remediation, ↑ from 90.11%) | 99.66% | 99.82% | 438 |

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
real user credentials, the following are non-negotiable, in this order — **updated 2026-08-16 to reflect
the remediation pass above**; BAL-004 is now fixed and dropped from this list, everything else is
unchanged since none of it was in scope for this pass (deliberately, per user instruction):

1. **BAL-001** — real authentication, with `createdBy`/`releasedBy`/etc. derived server-side from a
   verified identity, not trusted from the request body. *(Explicitly not actioned in the 2026-08-16
   pass, by instruction — treated as an accepted prototype-scope decision, not an oversight.)*
2. **BAL-002** — Angular upgraded off the CVE-affected 17.3.x line. *(Deferred in the 2026-08-16 pass —
   see that finding's own Outcome note for why and what the follow-up work looks like.)*
3. **BAL-008, BAL-009** — CORS allow-list, security headers + rate limiting. *(Still open; Minor severity,
   out of scope for a Critical/Major-only pass.)*
4. **BAL-007** — the SQLite→PostgreSQL engine swap, if this project's storage layer is ever promoted
   beyond prototype use. *(Not actioned in the 2026-08-16 pass — needs a real Postgres instance to
   develop/test against, which this environment doesn't have.)*

None of the Maintainability findings (BAL-003 — 1 of 3 planned extractions now done, BAL-005 — fixed,
BAL-006 — fixed at the boundary, BAL-010–BAL-012) block a production decision on their own, but BAL-003's
remaining two extractions (Checker actions, Look Up panel) will keep making every future change to the
Transaction Builder riskier and slower than necessary until addressed, and should be scheduled
independently of any production timeline.

Per this project's own standing rule (`lc-balance-wc/CLAUDE.md`): any remediation work here must come with
matching test updates and must leave all three suites passing at their 90% floor before being considered
complete.
