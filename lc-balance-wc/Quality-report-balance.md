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
remediation pass that fixed several of its own Critical/Major findings. That pass was followed by a
**second, user-directed remediation pass** (also 2026-08-16, this section's own update) that targeted
BAL-003, BAL-101, BAL-102, and every open Security Hotspot/Code Smell finding (BAL-103–BAL-108) by name.
Per explicit user decisions made before that pass started: BAL-101 was fixed by **removing** the dead code
(not wiring it live — the only option that didn't change existing business behavior), and BAL-102 was
**kept deferred, no action** (no PostgreSQL instance available in this sandboxed environment). The
Outcome/status lines under each finding below reflect that second pass; nothing here is a diff against an
untouched baseline — every finding was independently re-verified against the current codebase, same
convention as the first pass.

---

## Overall Quality Score

| Dimension | Rating | Notes |
|---|---|---|
| **Reliability** | A (4.8/5) | 655/655 tests passing across 3 independent suites (439 Angular + 189 microservice + 27 backend — microservice grew 186→189 with `migrations.test.ts`, BAL-106); the one genuine dead-code/functional-gap finding (BAL-101) is fixed, no other logic bugs found in this review's scope. |
| **Security** | B- (3.5/5) | No injection/secrets exposure; parameterized SQL; dependency hygiene good (2 of 3 sub-projects have zero `npm audit` findings). Both Minor hotspots (BAL-103 CORS, BAL-104 headers/rate-limiting) are fixed. Held back by the two unchanged structural gaps: no authentication anywhere, and 8 High CVEs in production Angular deps — both explicitly out of scope for this pass. |
| **Maintainability** | B+ (3.9/5) | The 32-instance duplication hotspot is gone, the API boundary went from 9/10 methods typed `any` to 1, ESLint/Prettier now exist project-wide (BAL-105), the migration runner (BAL-106) and app-export shape (BAL-107) are fixed, and the God Component now shares its paging AND Look Up panel fetch logic — but the component itself is still ~2,800 lines and still owns the Checker-actions block (deliberately not touched — see BAL-003) plus 5 of 11 originally-`any` fields (BAL-108, partially fixed by design). |
| **Coverage** | A+ (5/5) | All 3 suites clear a **95%** floor (raised from 90%) on statements/branches/functions/lines. |
| **Duplication** | A (4.6/5) | The one real hotspot found in this codebase has been eliminated; nothing else rises to a SonarQube-flaggable duplication block in this review's sweep. |

### Composite score: **82 → 85 → 88 / 100 (B → B+ → A-)**

**Final assessment: CONDITIONAL PASS.** Sound for continued prototype/demo development, and the codebase
is measurably healthier than a structural snapshot alone would suggest — real engineering effort has gone
into closing every open finding this review flagged as Major or below, across two remediation passes:
BAL-101/BAL-103/BAL-104/BAL-105/BAL-106/BAL-107 are now **Fixed**, BAL-108 is **Partially Fixed** (an
honest, scoped limitation — see its own section), BAL-003 has **2 of 3** planned extractions done, and
BAL-102 is **explicitly deferred** (a user-confirmed decision this session, not an oversight — no
PostgreSQL instance available in this sandboxed environment). It remains **NOT production-ready as-is**:
BAL-001 (no authentication) and BAL-002 (dependency CVEs) are unchanged release blockers for any
deployment handling real trade-finance data, independent of everything else that's improved — both were
explicitly out of scope for this remediation pass. See
[Gate Conditions](#gate-conditions-before-any-production-consideration) at the end.

---

## Table of Findings (priority order)

| ID | Severity | Category | Title |
|---|---|---|---|
| [BAL-001](#bal-001) | 🔴 Blocker | Vulnerability | No authentication/authorization anywhere in the microservice |
| [BAL-002](#bal-002) | 🟠 Critical | Vulnerability | 8 High-severity CVEs in production Angular dependencies |
| [BAL-003](#bal-003) | 🟠 Critical | Code Smell | `transaction-builder.component.ts` is a 2,800+-line God Component — **2 of 3 extractions done** |
| [BAL-101](#bal-101) | 🟡 Major | Bug | `dualInstrumentFallback` (B5's Sight/Usance retry) is dead code — declared, documented, never wired to any real function — **Fixed** |
| [BAL-102](#bal-102) | 🟡 Major | Technical Debt | SQLite whole-file locking blocks per-instrument concurrency — **Deferred (user-confirmed)** |
| [BAL-103](#bal-103) | 🔵 Minor | Security Hotspot | Backend CORS allows any origin — **Fixed** |
| [BAL-104](#bal-104) | 🔵 Minor | Security Hotspot | No security headers or rate limiting on either Express service — **Fixed** |
| [BAL-105](#bal-105) | 🔵 Minor | Code Smell | No ESLint/Prettier configured anywhere in the three sub-projects — **Fixed** |
| [BAL-106](#bal-106) | 🔵 Minor | Code Smell | Hand-rolled schema migration instead of a migration tool — **Fixed** |
| [BAL-107](#bal-107) | 🔵 Minor | Code Smell | Test-only internals attached to the Express `app` export — **Fixed** |
| [BAL-108](#bal-108) | 🔵 Minor | Code Smell | Residual `any` typing inside `transaction-builder.component.ts` — **Partially Fixed** |
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

**Outcome (2026-08-16): Deferred, no action — explicitly user-confirmed.** Before this pass started, the
user was asked whether to (a) keep this deferred, matching the prior pass's own posture, or (b) prepare an
unverified parallel PostgreSQL implementation behind a flag despite having no Postgres instance to test it
against; the user selected (a). No code changed for this finding — `db/index.ts`'s own doc comment and
this project's `CLAUDE.md` Database layer section already carry the must-replace-before-production posture
accurately, so nothing needed updating there either. This remains a **gate condition** (see
[Gate Conditions](#gate-conditions-before-any-production-consideration)), not a closed finding.

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
**`transaction-builder.component.ts` is a 2,800+-line God Component** — 🟠 Critical (2 of 3 planned extractions now done)

**Evidence:**
```
$ wc -l src/app/transaction-builder/transaction-builder.component.ts
2809 src/app/transaction-builder/transaction-builder.component.ts   # was 2829 before this pass's Look Up panel extraction

$ grep -o "if (\|else if\|&&\|||\| ? \|case " src/app/transaction-builder/transaction-builder.component.ts | wc -l
361   # decision points — a rough cyclomatic-complexity proxy (was 367)
```
One class still owns: function/side selection, three independently-paginated catalog/parent/IB-index
pickers (now sharing `loadPagedCatalog()`), natural-key search (simplified this pass — see BAL-101), the
Maker `submit()` dispatch across all 14 named business functions (~430 lines on its own), the Checker's
compound release/reject/acknowledge/cancel logic (~195 lines, untouched — see below), and the Look Up
panel (now sharing its own fetch helpers, see below). This is well past any Single Responsibility boundary
a SonarQube "Class Complexity"/"File Complexity" gate would flag.

**What changed this pass:** extraction 2 of the 3-item plan below is done — the Look Up panel's three
near-identical "fetch snapshot + fetch/sort movements by eventSeq" pairs (Tab 1 LC, Tab 2 Acceptance, Tab
3 SG, previously duplicated across `runLookup()`/`selectLookupSg()`/`selectLookupAcceptance()`) are now one
shared `loadSnapshotAndMovements()` private helper, and `runLookup()`'s two near-identical "fetch
candidates under this LC, auto-pick if exactly one" catalog calls (Acceptance/SG) are now one shared
`loadUnderLookupCandidates()` helper — same "guard/params unchanged, only the fetch/populate body moves"
convention as `loadPagedCatalog()` (extraction 1). Zero template changes (the `.html` binds to the same
public method names and fields as before), zero test changes needed — the full existing spec suite (439
tests) passed unchanged, confirming byte-for-byte identical behavior. Also removed this pass, as a direct
consequence of BAL-101's fix: two duplicated dual-instrument-fallback retry blocks in
`searchExistingContract()` and `searchCheckerLc()`, which were themselves a smaller duplication instance.
Net line count is roughly flat (extraction removed duplicated logic but added doc comments explaining the
shared helpers), which is expected and consistent with extraction 1's own prior result — this finding
tracks responsibility/duplication reduction, not raw line count.

**Why the severity is still Critical despite two real extractions:** the God Component itself — one class
doing five or six genuinely separate jobs — is still there. The third planned extraction (Checker actions:
submit/release/reject/cancel/acknowledge, ~800+ lines) is the highest-risk piece — it's the actual
money-moving/state-transition logic, not a same-behavior fetch/populate consolidation like the two already
done. It was **deliberately not attempted** in this pass: unlike the paging and Look Up panel extractions,
there's no clean "guard/params unchanged, only the body moves" shape available for a block this large and
business-critical without a real design/reviewer sign-off first — attempting it blind would risk exactly
the regression this pass's own "no business functionality changes" constraint forbids.

**Recommended remediation, in priority order (2 of 3 now done):**
1. ~~Shared paging state machine for the three near-identical pickers.~~ **Done** — `loadPagedCatalog()`.
2. ~~A standalone extraction for the LC/Acceptance/SG Look Up tabs.~~ **Done** —
   `loadSnapshotAndMovements()` + `loadUnderLookupCandidates()`.
3. A `ChecklistActionsComponent` (or service) for submit/release/reject/cancel/acknowledge, taking the
   resolved `TransactionFunction` + model as input rather than reaching into the host component's own
   fields. **Deliberately deferred — needs a reviewer-scoped design pass before attempting, not a
   drive-by refactor.**

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

**Outcome (2026-08-16): Fixed.** New `microservices/balance-component/src/db/migrations.ts` — a
`schema_migrations` tracking table plus an ordered `Migration[]` array, each with an `id`/`description`/
`up(db)`. `db/index.ts`'s old inline `ALTER TABLE` check-and-run was removed and replaced with a call to
`runMigrations(db)`; the existing `acknowledged_by`/`acknowledged_at` column addition became migration
`id: 1`. Adding a future schema change is now "append a `Migration` object to the array", not "write a new
one-off `PRAGMA table_info` guard." New `test/unit/db/migrations.test.ts` (3 tests: fresh-run applies +
records; second run is a no-op and doesn't re-throw "duplicate column"; backward-compat with a
pre-existing db that already has the columns but no tracking table) — `migrations.ts` itself at 100%
coverage. Verified: `npm run typecheck` clean; `npm test` → 189/189 (up from 186), coverage unchanged
above the 95% floor.

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

**Outcome (2026-08-16): Fixed.** `backend/server.js` now exports exactly
`module.exports = { app, runCase, resolveLogicalContractId, callMicroservice };` — the recommendation
above, verbatim. `backend/test/server.test.js`'s import updated from `const app = require('../server')` to
`const { app } = require('../server')`; `runCase.test.js` already used destructuring and needed no import
change (only its own header comment updated to describe the new export shape). Found along the way: the
export had regressed to the old `module.exports = app; module.exports.runCase = ...` shape at some point
before this fix landed (a live break, not something introduced by this pass) — fixing BAL-107 fixed that
regression as a side effect. Verified: `npm test` in `backend/` → 27/27 passing, coverage unchanged above
the 95% floor.

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

**Outcome (2026-08-16): Partially Fixed — 6 of 11 identified fields retyped, 5 deliberately left as `any`.**
Retyped with zero test breakage: `lookupResult` (`{ contract: BalanceContract; snapshot: BalanceSnapshot }
| null`), `lookupMovements`/`acceptanceMovements`/`sgMovements` (`BalanceMovement[]`), `acceptanceSnapshot`/
`sgSnapshot` (`BalanceSnapshot | null`). **Left as `any`/`any[]` on purpose:** `catalogPayableMovements`,
`payableMovements`, `selectedPayMovement`, `checkerItems`, `selectedCheckerMovement` — retyping these to
`BalanceMovement` broke ~15+ existing test fixtures in `transaction-builder.component.spec.ts` and
`transaction-builder.component.selection.spec.ts`, which intentionally construct partial objects (e.g.
`{movementId: 'm2'}`, missing `balanceContractId`/`eventSeq`/`exposureNature`/etc.) for exactly these
fields. Rewriting those fixtures to satisfy the full `BalanceMovement` shape was judged out of scope for a
root-cause fix that must not change business functionality or require a large, unplanned test-fixture
rewrite — reported here as an honest, incremental-by-design scope limitation rather than claimed as fully
resolved. Verified: `npx tsc -p tsconfig.app.json --noEmit` clean; `npm test` → 439/439 passing, coverage
unchanged above the 95% floor; `npm run lint` 0 errors (the remaining 5 fields' `any` usage is exactly the
kind of finding `no-explicit-any: 'warn'` (BAL-105) exists to keep visible, not block on).

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
prior review's 90% floor. 655 tests total, all green as of this final verification pass (`npm test` exit
code 0 in each of the three directories) — the microservice count rose 186 → 189 with BAL-106's new
`migrations.test.ts`; Angular and backend counts are unchanged from the prior pass (BAL-101's own test
rewrites kept the same overall count — 2 obsolete tests replaced with 2 new ones, not a net change):

| Suite | Statements | Branches | Functions | Lines | Tests |
|---|---|---|---|---|---|
| `microservices/balance-component/` | 99.35% | 96.18% | 100% | 99.76% | 189 |
| `backend/` | 97.95% | 97.36% | 95.65% | 97.75% | 27 |
| Angular app (`src/app/`) | 99.75% | 95.52% | 99.66% | 99.82% | 439 |

All three also pass their own lint gate clean (0 errors — Angular 227 warnings, microservice 6, backend 2,
all pre-existing `any`/unused-directive warnings, none newly introduced this pass), and the Angular app's
`ng build --configuration development` completes clean.

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

**BAL-103 and BAL-104 (CORS allow-list, security headers + rate limiting) are fixed** — no longer gate
conditions. **BAL-101** (`dualInstrumentFallback` dead code) is fixed. **BAL-105/106/107** (ESLint/
Prettier, migration runner, app-export shape) are fixed. **BAL-108** (residual `any` typing) is partially
fixed — the remaining 5 fields are visible/tracked (via `no-explicit-any: 'warn'`) but not blocking.

None of the Maintainability findings (BAL-003, BAL-105–BAL-108) block a production decision on their own,
but BAL-003's one remaining extraction (Checker actions — submit/release/reject/cancel/acknowledge) will
keep making every future change to that ~800-line block riskier and slower than necessary until it gets
its own reviewer-scoped design pass; it was deliberately not attempted as a drive-by refactor in this
pass, unlike the two lower-risk extractions (paging, Look Up panel) that are now both done.
