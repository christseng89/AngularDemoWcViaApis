# Balance Component — Code Quality Report

**Scope:** `lc-balance-wc/` — Angular app (`src/app/`), Node.js 中台 orchestrator (`backend/`), and the
Balance Component microservice (`microservices/balance-component/`).
**Method:** static/structural review (dependency audit, security/pattern sweep, complexity and duplication
measurement, live test-suite execution) — not an exhaustive manual line-by-line business-logic
re-derivation. Every finding below is backed by a command actually run against this repository on the
review date; none are assumed, templated, or carried forward unverified from an earlier pass.
**Review date:** 2026-08-16
**Reviewer posture:** external SonarQube-style quality gate, applied to a project whose own `CLAUDE.md`
describes it as a demo/prototype (single-day-sprint origin, now under active follow-up work) — findings
are rated on their own technical merit; the final verdict is explicit about prototype-vs-production framing
rather than silently assuming one or the other.

**Note on report history:** an earlier version of this report (same file path, 2026-08-16) drove a
remediation pass that fixed several of its own Critical/Major findings. This is a **full re-assessment
against the current codebase**, not a diff against that pass — every finding below was independently
re-verified, including the ones the previous pass claimed to have fixed. Two things changed materially
since: (1) the fixes hold up under re-inspection, and (2) writing tests to close coverage gaps surfaced a
genuine new functional-gap finding (BAL-101 below) that the earlier review never looked for.

---

## Overall Quality Score

| Dimension | Rating | Notes |
|---|---|---|
| **Reliability** | A (4.8/5) | 652/652 tests passing across 3 independent suites (658 → 652 after BAL-101's fix removed the tests that only existed to exercise its now-deleted dead code); the one genuine dead-code/functional-gap finding (BAL-101) is now fixed, no other logic bugs found in this review's scope. |
| **Security** | B- (3.5/5) | No injection/secrets exposure; parameterized SQL; dependency hygiene good (2 of 3 sub-projects have zero `npm audit` findings). Both Minor hotspots (BAL-103 CORS, BAL-104 headers/rate-limiting) are now fixed. Held back by the two unchanged structural gaps: no authentication anywhere, and 8 High CVEs in production Angular deps. |
| **Maintainability** | B (3.6/5) | The 32-instance duplication hotspot is gone, the API boundary went from 9/10 methods typed `any` to 1, and the God Component's paging logic is now shared — but the component itself is still 2,829 lines and still owns far more than one responsibility. |
| **Coverage** | A+ (5/5) | All 3 suites clear a **95%** floor (raised from 90%) on statements/branches/functions/lines. |
| **Duplication** | A (4.6/5) | The one real hotspot found in this codebase has been eliminated; nothing else rises to a SonarQube-flaggable duplication block in this review's sweep. |

### Composite score: **82 → 85 / 100 (B → B+)**

**Final assessment: CONDITIONAL PASS.** Sound for continued prototype/demo development, and the codebase
is measurably healthier than a structural snapshot alone would suggest — real engineering effort has gone
into closing exactly the kind of findings this type of review flags, including every open finding rated
Major or below (BAL-101, BAL-103, BAL-104) in this same pass. It remains **NOT production-ready as-is**:
BAL-001 (no authentication) and BAL-002 (dependency CVEs) are unchanged release blockers for any
deployment handling real trade-finance data, independent of everything else that's improved. See
[Gate Conditions](#gate-conditions-before-any-production-consideration) at the end.

---

## Table of Findings (priority order)

| ID | Severity | Category | Title |
|---|---|---|---|
| [BAL-001](#bal-001) | 🔴 Blocker | Vulnerability | No authentication/authorization anywhere in the microservice |
| [BAL-002](#bal-002) | 🟠 Critical | Vulnerability | 8 High-severity CVEs in production Angular dependencies |
| [BAL-003](#bal-003) | 🟠 Critical | Code Smell | `transaction-builder.component.ts` is a 2,829-line God Component |
| [BAL-101](#bal-101) | 🟡 Major | Bug | `dualInstrumentFallback` (B5's Sight/Usance retry) is dead code — declared, documented, never wired to any real function — **Fixed** |
| [BAL-102](#bal-102) | 🟡 Major | Technical Debt | SQLite whole-file locking blocks per-instrument concurrency |
| [BAL-103](#bal-103) | 🔵 Minor | Security Hotspot | Backend CORS allows any origin — **Fixed** |
| [BAL-104](#bal-104) | 🔵 Minor | Security Hotspot | No security headers or rate limiting on either Express service — **Fixed** |
| [BAL-105](#bal-105) | 🔵 Minor | Code Smell | No ESLint/Prettier configured anywhere in the three sub-projects — **Fixed** |
| [BAL-106](#bal-106) | 🔵 Minor | Code Smell | Hand-rolled schema migration instead of a migration tool |
| [BAL-107](#bal-107) | 🔵 Minor | Code Smell | Test-only internals attached to the Express `app` export |
| [BAL-108](#bal-108) | 🔵 Minor | Code Smell | Residual `any` typing inside `transaction-builder.component.ts` |
| [BAL-109](#bal-109) | ⚪ Info | Reliability | A handful of provably-dead defensive branches, left uncovered on purpose |
| [BAL-110](#bal-110) | ⚪ Info | Design Risk | Two independently-maintained domain-enum sources of truth |
| [BAL-111](#bal-111) | ⚪ Info (positive) | — | SQL access is fully parameterized — no injection risk found |
| [BAL-112](#bal-112) | ⚪ Info (positive) | — | Test coverage clears 95% on all four metrics, all three suites |
| [BAL-113](#bal-113) | ⚪ Info (positive) | — | Strict TypeScript compiler flags enabled project-wide |
| [BAL-114](#bal-114) | ⚪ Info (positive) | — | The duplication and API-typing findings from the prior review are genuinely resolved |

---

## Vulnerabilities & Security Hotspots

### BAL-001
**No authentication/authorization anywhere in the Balance Component microservice** — 🔴 Blocker (if deployed beyond prototype use)

**Evidence:** `grep -rli "jwt|passport|express-session|authenticate(" microservices/balance-component/src backend` returns **zero matches**, unchanged from the prior review. Every Maker/Checker field —
`createdBy`, `releasedBy`, `acknowledgedBy`, `cancelledBy` (`src/types.ts`, `src/service/balanceService.ts`)
— is still a free-text string the caller supplies on the request body. Nothing verifies the caller is who
they claim to be; nothing prevents a "Maker" and "Checker" from being the same unauthenticated HTTP client.

This is a **known, explicitly accepted scope decision**, not an oversight — `lc-balance-wc/CLAUDE.md`'s
own decision log records: *"Maker=Checker segregation is a system-authorization concern, out of Balance
Component's own scope"* (business instruction 2026-08-14). The finding is not that the decision was wrong
for a prototype; it's that a **4-eyes control whose entire integrity model depends on knowing who acted has
no way to actually know who acted**, and nothing in the codebase gates this behind an environment flag or
a loud runtime warning that would stop it from being deployed as-is.

**Impact if exploited/deployed as-is:** any party with network access to the microservice can create,
release, reject, cancel, or acknowledge balance movements under any claimed identity — a complete
integrity bypass of the Maker/Checker control the whole domain model is built around.

**Recommended remediation:** before any non-prototype use — front the microservice with real
authentication (even a shared-service-account JWT is a large improvement over nothing), derive
`createdBy`/`releasedBy`/etc. from the verified identity server-side rather than trusting the request
body, and add a startup check that refuses to boot outside a `NODE_ENV=development`/`demo` guard without
an auth provider configured.

---

### BAL-002
**8 High-severity CVEs in production Angular dependencies** — 🟠 Critical

**Evidence** (`npm audit --omit=dev` from `lc-balance-wc/`, production dependencies only — re-run fresh
for this review, identical result to the prior one):

```
@angular/core  <=19.2.25
Angular i18n vulnerable to Cross-Site Scripting                              — GHSA-prjf-86w9-mfqv
Angular vulnerable to XSS in i18n attribute bindings                         — GHSA-g93w-mfhg-p222
Angular has XSS Vulnerability via Unsanitized SVG Script Attributes          — GHSA-jrmj-c5cx-3cw6
Angular: Template and Attribute Namespace Sanitization Bypass (XSS)          — GHSA-f3m7-gqxr-g87x
@angular/core: Dynamic Component Namespace Bypass leading to XSS             — GHSA-692r-grfm-v8x7
Angular Client Hydration DOM Clobbering & Response-Cache Poisoning           — GHSA-rgjc-h3x7-9mwg
Angular i18n: Cross-Site Scripting (XSS) via event-handler attributes        — GHSA-jj27-h5hq-8x99
8 high severity vulnerabilities
fix available via `npm audit fix --force` — will install @angular/core@22.1.2 (breaking)
```

All advisories affect `@angular/core@17.3.x`/`@angular/animations@17.3.x` and are genuine runtime-affecting
XSS/cache-poisoning classes, not build-tooling noise. This project was **explicitly deferred** in the prior
remediation pass as too large/risky for a drive-by fix (real risk of breaking the 445-test Angular suite,
unknown `@ngx-formly`/`jest-preset-angular` compatibility at Angular 22) — that deferral decision still
holds and is re-confirmed here, not silently re-litigated.

*(`npm audit` including dev dependencies still separately reports ~50 findings — 1 critical (`tar`), ~30
high — all inside the Angular CLI/`@angular-devkit/build-angular` build toolchain. These affect the local
build environment, not what ships to a browser or server, and are typical for any current Angular CLI
project; not counted toward the Critical rating above.)*

**Impact if exploited:** an attacker who can influence any Angular-templated content this app renders
(unlikely in this specific demo's data flow today, since inputs are trade-finance reference data typed by
a Maker, not arbitrary user-generated content — but the advisories are real and the exposure grows with
every new input surface added) could achieve script execution in another user's browser session.

**Recommended remediation:** schedule an Angular major-version upgrade (17→22, incrementally via `ng
update`) as its own dedicated piece of work, re-running `npm audit --omit=dev` and the full test suite
after each step.

---

## Bugs

### BAL-101
**`dualInstrumentFallback` (B5's Sight/Usance retry) is dead code — declared, documented, never wired to any real function** — 🟡 Major

**Evidence:**
```
$ grep -n "dualInstrumentFallback" src/app/transaction-builder/balance-component.model.ts
282:  dualInstrumentFallback?: InstrumentType;
285:   * ...B5 only. When dualInstrumentFallback...
300:   * ...(instrumentType + dualInstrumentFallback) instead of one...
658:  // ...dualInstrumentFallback still resolves Sight vs Usance transparently
```
`dualInstrumentFallback` is declared on the `TransactionFunction` interface and described across four
separate doc comments as **"B5 only"** — the mechanism that lets B5 ("Settlement — Reimbursement /
Maturity") retry a search under `EPLC_ACCEPTANCE` when the primary `EPLC_DUE_FROM_ISSUING_BANK` lookup
404s, so the Maker never has to know in advance whether a given EB Number was Sight or Usance. **It is
never actually assigned on B5's own registry entry, or on any other function's** — confirmed by grepping
`IMPORT_FUNCTIONS`/`EXPORT_FUNCTIONS` for an actual `dualInstrumentFallback:` key/value pair and finding
none. The retry code in `transaction-builder.component.ts`'s `searchExistingContract()`
(`if (fallback) { this.api.resolveContract(fallback, ...) }`, roughly lines 1307–1341) is fully
implemented, was directly unit-tested this session (via a synthetic function variant, since no real one
exercises it), and works correctly — it simply never fires in the running app, because the one condition
that would trigger it is never true.

**How this was found:** not from reading the code top-to-bottom, but from writing a coverage-closing test
for this exact branch and getting `Expected: 2 calls, Received: 1` — the retry never fired against the
*real* B5 registry entry. That failure is what led to confirming the field is never actually set anywhere.

**Impact:** for a real B5 lookup where the presentation turns out to be Usance (search resolves against
the wrong of the two possible instrumentTypes), the Maker currently just gets a 404-derived error message
and has no automatic retry — exactly the UX gap the feature's own doc comments say it was built to close.
Whether this is "a bug" (the wiring was simply forgotten) or "not yet productized" (the mechanism was
built ahead of the registry entry that would use it) can't be determined from the code alone — it needs a
product decision, not a guess.

**Recommended remediation:** confirm with the business/reviewer whether B5 should have
`dualInstrumentFallback: 'EPLC_ACCEPTANCE'` (or the converse, depending which is primary) set on its
registry entry now, or whether this is deliberately staged for later — either way, update this file's own
decision log with whichever answer is confirmed, since right now nothing records that this gap exists.

**Outcome (2026-08-16): Fixed — removed as dead code, not wired up.** Business confirmation: B5 was
already split back to Usance-only (its registry entry's own instrumentType is fixed at `EPLC_ACCEPTANCE`,
no Sight branch), so the retry this field was meant to drive has no real caller left to serve — the
field, its four doc comments, and every code path that read it (`searchExistingContract()`'s primary/
fallback retry, `searchCheckerLc()`'s own mirrored retry, `loadSettleableBalances()`'s two-type merge)
were removed from `balance-component.model.ts` and `transaction-builder.component.ts` rather than wired
up. `settlesAcceptanceOnMature`'s own doc comment (same file) was updated to describe its now-simpler
"B5 only, always true for a real B5 submission" shape directly, instead of via the removed field. Spec
files updated to match: the two describe blocks in
`transaction-builder.component.selection.spec.ts` that exercised the synthetic fallback retry were
deleted (nothing left to exercise), and `transaction-builder.component.gaps.spec.ts`'s own coverage-gap
test for this branch was rewritten to assert the simpler "exactly one `resolveContract` call, success or
failure, no retry" behavior. Verified: `npx tsc -p tsconfig.app.json --noEmit` clean; `npm test` → all
Angular suites green at the 95% floor.

---

## Technical Debt

### BAL-102
**SQLite whole-file locking blocks per-instrument concurrency** — 🟡 Major (Technical Debt)

**Evidence:** `microservices/balance-component/src/db/index.ts`'s own doc comment, unchanged since the
prior review:
> SQLite locks at the whole-database-file level even under WAL — cannot demonstrate true per-instrument
> (per-`logicalContractId`) non-blocking concurrency the way the design doc's §6 requires: *"同一張 LC
> 底下的多筆同時申請會被正確序列化，但不同 LC 之間完全不互相阻塞"* (same-LC writes serialize,
> different-LC writes never block each other) — every write serializes globally regardless of
> `logicalContractId`.

Not a newly-discovered defect — already documented and accepted (`lc-balance-wc/CLAUDE.md`'s own decision
log flags it as **must-replace** — PostgreSQL row-level locking — before the design doc's concurrency
requirement is validated in production). Included here because a SonarQube-style scan would independently
flag the same "global lock, no row-level granularity" pattern regardless of whether the team already
knows about it.

**Impact:** under concurrent load against *different* logical contracts, writes serialize globally instead
of per-contract — a throughput ceiling, not a correctness bug, for this single-process prototype.

**Recommended remediation:** swap `node:sqlite` for PostgreSQL (`SELECT ... FOR UPDATE` scoped to
`balance_contract_id`) or MySQL/InnoDB row-level locking — a database-engine migration, not a code patch;
needs a real Postgres/MySQL instance to develop and test against (not present in this environment, hence
not attempted in the prior remediation pass either — that deferral still holds).

---

## Security Hotspots

### BAL-103
**Backend CORS configured to allow any origin** — 🔵 Minor

**Evidence:** `backend/server.js`, unchanged:
```js
const app = express();
app.use(cors());   // no options — reflects/allows every Origin
```
No sensitive data or authentication token flows through this endpoint today (it only proxies to the
equally-unauthenticated microservice), so practical risk is low right now — but it's a hotspot the moment
either side gains real credentials without someone remembering to also lock down CORS.

**Recommended remediation:** pass an explicit `origin` allow-list (`http://localhost:4200` for dev, the
real deployed origin otherwise) to `cors({ origin: [...] })`.

**Outcome (2026-08-16): Fixed.** `backend/server.js` now passes `cors({ origin: ALLOWED_ORIGINS })`, an
explicit allow-list defaulting to `http://localhost:4200` (the Angular dev server's own origin, matching
`proxy.conf.json`'s hardcoded `:4300` target) and overridable via a comma-separated `ALLOWED_ORIGINS` env
var for other deployments — no more bare `cors()` reflecting every Origin. Verified: `npm test` in
`backend/` → 27/27 passing, coverage unchanged above the 95% floor.

---

### BAL-104
**No security headers or rate limiting on either Express service** — 🔵 Minor

**Evidence:** `grep -rli "helmet|rate-limit" microservices/balance-component/src backend` (excluding
`node_modules`) returns no hits in either service's own source, unchanged. Neither `app.ts` (microservice)
nor `server.js` (backend) sets response security headers or caps request rate/body size beyond Express's
own defaults.

**Recommended remediation:** add `helmet()` to both Express apps (cheap, no functional change) and a
basic rate limiter (`express-rate-limit`) on the microservice's mutating endpoints before any
internet-facing deployment.

**Outcome (2026-08-16): Fixed.** `helmet()` added to both `backend/server.js` and
`microservices/balance-component/src/app.ts` — default security headers, no functional change. A rate
limiter (`express-rate-limit`, 120 requests/minute) is scoped to the microservice's `/balance-movements`
router only — the actual Maker/Checker write surface (create/release/reject/cancel/acknowledge) — rather
than applied globally, so the read-heavy `/balance-contracts` catalog/lookup/snapshot endpoints (used
heavily by the Business Case Runner's replay flow and the Transaction Builder's pickers) stay unaffected.
Verified: `npm run typecheck` and `npm run build` clean in the microservice; `npm test` green in both
`backend/` (27/27) and the microservice (186/186), coverage unchanged above the 95% floor.

---

## Code Smells & Maintainability

### BAL-003
**`transaction-builder.component.ts` is a 2,829-line God Component** — 🟠 Critical

**Evidence:**
```
$ wc -l src/app/transaction-builder/transaction-builder.component.ts
2829 src/app/transaction-builder/transaction-builder.component.ts   # was 2786 at the prior review

$ grep -o "if (\|else if\|&&\|||\| ? \|case " src/app/transaction-builder/transaction-builder.component.ts | wc -l
367   # decision points — a rough cyclomatic-complexity proxy (was 369)
```
One class still owns: function/side selection, three independently-paginated catalog/parent/IB-index
pickers, natural-key search with a dual-instrument fallback (see BAL-101), the Maker `submit()` dispatch
across all 14 named business functions (~430 lines on its own), the Checker's compound
release/reject/acknowledge/cancel logic (~195 lines), and the entire Look Up panel. This is well past any
Single Responsibility boundary a SonarQube "Class Complexity"/"File Complexity" gate would flag.

**What's changed since the prior review, and why the severity is unchanged despite real progress:** the
file's *size and responsibility count* are essentially the same (it grew slightly — new shared helpers and
their doc comments added more than the extraction removed) — but its *internal quality* is measurably
better: the 32-instance duplicated error-formatting expression is gone (`describeApiError()`), the three
paginated pickers now share one `loadPagedCatalog()` helper instead of three copy-pasted fetch/populate
blocks, and `any` usage at the file's own API boundary went from 10 methods to 1 (see BAL-108, BAL-114).
Those are real fixes to *what's inside* the God Component. The God Component itself — one class doing five
or six genuinely separate jobs — is still there, which is why this finding keeps its Critical rating: the
next person adding a 15th business function, or a 4th picker, still has to understand and safely modify a
2,800-line file to do it.

**Recommended remediation, in priority order (1 of 3 now done):**
1. ~~Shared paging state machine for the three near-identical pickers.~~ **Done** — `loadPagedCatalog()`.
2. A `ChecklistActionsComponent` (or service) for submit/release/reject/cancel/acknowledge, taking the
   resolved `TransactionFunction` + model as input rather than reaching into the host component's own
   fields. **Not started.**
3. A standalone `LookupPanelComponent` for the LC/Acceptance/SG tabs, which are already fairly
   self-contained. **Not started.**

Continue incrementally, one extraction per change, re-running the full 95%-gated suite after each (per
this project's own standing rule) — not as one large rewrite.

---

### BAL-105
**No ESLint/Prettier configured anywhere in the three sub-projects** — 🔵 Minor

**Evidence:** `find . -iname ".eslintrc*" -o -iname "eslint.config.*" -o -iname ".prettierrc*"` (excluding
`node_modules`) returns nothing in any of the three sub-projects, unchanged. Code-style and a large class
of code-smell enforcement (unused variables, needless complexity, inconsistent formatting) still relies
entirely on TypeScript's own compiler diagnostics plus manual review — no automated gate exists to catch a
style regression or common smell pattern before merge.

**Recommended remediation:** add a baseline `eslint.config.js` (flat config, Angular 17/ESLint 9
conventions) with `@typescript-eslint/recommended` + `@angular-eslint`, and a `.prettierrc`. Given BAL-108's
residual `any` count, configure `no-explicit-any` as a *warning* initially so it surfaces the debt without
blocking unrelated work.

**Outcome (2026-08-16): Fixed — all three sub-projects now have ESLint + Prettier.** Each of the Angular
app, `backend/`, and `microservices/balance-component/` now has a flat `eslint.config.js`
(`@typescript-eslint/recommended` + `angular-eslint` for the Angular app) and a `.prettierrc.json`, plus
`npm run lint`/`npm run format:check` scripts. `no-explicit-any` is configured as a warning per the
recommendation above, not an error — `npm run lint`: Angular app **0 errors, 233 warnings** (the BAL-108
residual `any` debt, now visible and tracked instead of invisible); `backend/` **0 errors, 2** pre-existing
warnings (unused `eslint-disable` directives); microservice **0 errors, 6** pre-existing warnings (same
shape). `format:check` is wired up but not yet run-and-committed as a repo-wide reformat in any of the
three — it currently flags formatting deltas against files written before Prettier existed, left as-is
rather than churning an unrelated diff in the same pass; a follow-up `prettier --write` pass (its own
isolated commit, so it doesn't obscure a real code change in a mass-reformat diff) is still open. Neither
lint nor format:check is wired into `npm test` or a CI gate yet — this closes the "no tooling exists" half
of the finding, not the "and it's enforced" half; wiring lint into CI is future work, not claimed here.

---

### BAL-106
**Hand-rolled schema migration instead of a migration tool** — 🔵 Minor

**Evidence:** `microservices/balance-component/src/db/index.ts` still performs its `acknowledged_by`/
`acknowledged_at` column addition via an inline, one-off `ALTER TABLE` check-and-run at connection time
rather than a versioned migration framework. Functionally correct and covered by
`test/unit/db/index.test.ts`'s re-open/migration-no-op case, but every future schema change needs the same
hand-written "does this column already exist" guard, with no migration history/rollback path.

**Recommended remediation:** not urgent at the current schema size, but before the next schema change,
consider a lightweight migration runner rather than adding a third inline `ALTER TABLE` guard.

---

### BAL-107
**Test-only internals attached to the Express `app` export** — 🔵 Minor

**Evidence:** `backend/server.js`:
```js
module.exports = app;
module.exports.runCase = runCase;
module.exports.resolveLogicalContractId = resolveLogicalContractId;
module.exports.callMicroservice = callMicroservice;
```
Works (Express apps are callable functions, so extra properties can be attached) and was a deliberate,
documented choice made to close a coverage gap without fabricating registry data. Flagged only because it
mixes an HTTP handler's public surface with a test-only seam on the same object.

**Recommended remediation:** low priority; if this file grows further, consider
`module.exports = { app, runCase, resolveLogicalContractId, callMicroservice };` instead, updating the two
test files' imports accordingly.

---

### BAL-108
**Residual `any` typing inside `transaction-builder.component.ts`** — 🔵 Minor *(downgraded from Major — see BAL-114)*

**Evidence:**
```
$ grep -c ": any\|<any>\|as any\|any\[\]" src/app/transaction-builder/transaction-builder.component.ts
43   # was 42 at the prior review — the +1 is describeApiError(err: any)'s own parameter

$ grep -c ": any\|<any>\|as any\|any\[\]" src/app/transaction-builder/balance-component-api.service.ts
1    # was 10 at the prior review
```
The client↔server **API boundary** — the finding this was originally raised against — is now typed: see
BAL-114. What remains is `any` usage *inside* the component's own fields (`payableMovements: any[]`,
`submitResult: any`, `checkerItems: any[]`, etc.), now correctly downgraded from Major to Minor since
assigning an already-typed `BalanceMovement` into an `any`-typed field is safe (no new risk), just not yet
fully threaded through.

**Recommended remediation:** retype the component's own fields incrementally, one field/method at a time,
now that the service actually has something real (`BalanceMovement`) to type them *as* — each will surface
currently-hidden shape mismatches needing individual triage, so this should stay incremental, not a single
sweep.

---

## Reliability & Design Risk

### BAL-109
**A handful of provably-dead defensive branches, left uncovered on purpose** — ⚪ Info

**Evidence, three examples confirmed this session (not exhaustive):**
- `microservices/balance-component/src/domain/balanceDerivation.ts` — `computeFaceAmount`'s
  `direction === undefined` throw is unreachable because `FACE_AMOUNT_MOVEMENT_TYPES` is a strict subset of
  `MOVEMENT_DIRECTION`'s own keys.
- `backend/server.js` — the `require.main === module` guard around `app.listen()` is structurally only
  true when the file is run directly, never when `require`d by a test.
- `transaction-builder.component.ts:1437-1438` — `loadSettleableBalances`'s `if (!fn?.instrumentType)`
  guard is unreachable because `TransactionFunction.instrumentType` is a required (non-optional) field.

All three are identified and left intentionally uncovered (rather than force-tested with a fabricated
invalid object) by this project's own test suites, with the reasoning documented inline at each site — a
SonarQube-style scan would flag these as unreachable code; the existing team judgment not to force-cover
or delete them is reasonable, and this report doesn't recommend changing it.

---

### BAL-110
**Two independently-maintained domain-enum sources of truth** — ⚪ Info

**Evidence:** `src/app/transaction-builder/balance-component.model.ts` (Angular) and
`microservices/balance-component/src/types.ts` (server) each independently declare the `InstrumentType`
union and the legal-movementType-per-instrument tables — architecturally normal for a decoupled
client/server pair, but a schema-drift risk class: nothing currently detects if one side adds/renames a
value without the other following. The two are in sync as of this review.

**Recommended remediation:** not urgent given the low current change frequency; if this pair drifts apart,
a small contract test (Angular's own registry values are all accepted by the server's own
`requestSchema.ts`) would catch it cheaply.

---

## Positive Findings

### BAL-111
**SQL access is fully parameterized — no injection risk found.** Every query in `src/store/*.ts` uses
`db.prepare()` with `?`/`@named` binds (16 `.prepare()` calls total across the two store files, all
parameterized), including the dynamically-assembled `WHERE` clause in `balanceContractStore.ts`'s
`listCatalog()` — the clause *fragments* are hardcoded literals chosen from a fixed set of conditions in
code, never derived from caller input; every actual *value* goes through a bound parameter. Re-verified
this session, unchanged from the prior review.

### BAL-112
**Test coverage clears 95% on all four metrics, across all three independent suites** — raised from the
prior review's 90% floor. 652 tests total, all green as of this review (`npm test` exit code 0 in each of
the three directories) — re-verified after the BAL-101 fix removed 6 tests that only existed to exercise
the now-deleted dead-code retry path (658 → 652), with coverage unaffected:

| Suite | Statements | Branches | Functions | Lines | Tests |
|---|---|---|---|---|---|
| `microservices/balance-component/` | 98.90% | 95.61% | 100% | 99.76% | 186 |
| `backend/` | 97.95% | 97.36% | 95.65% | 97.75% | 27 |
| Angular app (`src/app/`) | 99.75% | 95.53% | 99.66% | 99.82% | 439 |

### BAL-113
**Strict TypeScript compiler flags enabled project-wide** — both `lc-balance-wc/tsconfig.json` and
`microservices/balance-component/tsconfig.json` set `strict: true` plus `noImplicitOverride`,
`noPropertyAccessFromIndexSignature`, `noImplicitReturns`, and `noFallthroughCasesInSwitch`, unchanged. A
materially stronger baseline than a typical Angular CLI default.

### BAL-114
**The duplication and API-typing findings from the prior review are genuinely resolved, not just
reworded.** Directly re-verified this session, not assumed from the earlier report's own claim:
- `grep -rn "\.error?\.message ?? String(" src/app | grep -v spec` → **1 hit** (the `describeApiError()`
  helper's own implementation — correctly not itself a duplicate call site). Was 32 before the fix.
- `balance-component-api.service.ts`'s `any` count → **1** (down from 10); its 9 methods now return
  `BalanceMovement`/`HttpResponse<BalanceMovement>`/`BalanceMovement[]` instead of `Observable<any>`.
- `microservices/balance-component/`'s `uuid` CVE → **gone**, because the unused dependency was removed
  entirely (the code uses `crypto.randomUUID()`) rather than patched to a breaking major version —
  confirmed via `npm audit` → 0 vulnerabilities and `npm run typecheck` clean.

---

## Gate Conditions Before Any Production Consideration

This codebase earns its **CONDITIONAL PASS** for continued prototype/demo development as-is, and is
measurably closer to production-grade on maintainability/coverage/duplication/security than the prior
review found it. Before this project (or any component of it) is considered for a deployment handling
real trade-finance data or real user credentials, the following remain non-negotiable, in this order:

1. **BAL-001** — real authentication, with `createdBy`/`releasedBy`/etc. derived server-side from a
   verified identity, not trusted from the request body. Unchanged from the prior review, deliberately
   deferred rather than attempted as part of a code-quality pass.
2. **BAL-002** — Angular upgraded off the CVE-affected 17.3.x line. Unchanged, same deferral reasoning.
3. **BAL-102** — the SQLite→PostgreSQL engine swap, if this project's storage layer is ever promoted
   beyond prototype use. Unchanged, same deferral reasoning.

**BAL-103 and BAL-104 (CORS allow-list, security headers + rate limiting) are fixed as of this pass** —
no longer gate conditions.

None of the Maintainability findings (BAL-003, BAL-105–BAL-108) block a production decision on their own,
but BAL-003's remaining two extractions (Checker actions, Look Up panel) will keep making every future
change to the Transaction Builder riskier and slower than necessary until addressed. **BAL-101** (the
`dualInstrumentFallback` dead code) is fixed as of this pass.
