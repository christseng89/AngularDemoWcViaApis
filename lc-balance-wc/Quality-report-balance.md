# Balance Component — Code Quality Report

**Scope:** `lc-balance-wc/` — Angular app (`src/app/`), Node.js 中台 orchestrator (`backend/`), and the
Balance Component microservice (`microservices/balance-component/`).
**Method:** static/structural review (dependency audit, security/pattern sweep, complexity and duplication
measurement, live test-suite execution) — not an exhaustive manual line-by-line business-logic
re-derivation. Every finding below is backed by a command actually run against this repository on the
review date; none are assumed, templated, or carried forward unverified from an earlier pass. This is a
**full, independent re-assessment**, not a diff against the previous report — each of the three
sub-projects was swept fresh, and several genuinely new findings surfaced that no earlier pass had looked
for (see BAL-115–BAL-120).
**Review date:** 2026-08-16
**Reviewer posture:** external SonarQube-style quality gate, applied to a project whose own `CLAUDE.md`
describes it as a demo/prototype under active follow-up work — findings are rated on their own technical
merit; the final verdict is explicit about prototype-vs-production framing rather than silently assuming
one or the other.

**Note on report history:** two prior remediation passes (same review date) fixed several Critical/Major
findings from earlier versions of this report — dead code removal, CORS/security headers, ESLint/Prettier,
a proper migration runner, a God Component paging + Look Up panel extraction. This pass independently
re-verifies every one of those fixes still holds, and separately swept all three sub-projects from scratch
for anything not previously found. Six new findings surfaced (BAL-115–BAL-120), most notably a real
contract-invariant violation in the microservice's own monetary-amount handling (BAL-115) — **fixed the
same day this report was written**, immediately after being found (see BAL-115's own section for detail).

---

## Overall Quality Score

| Dimension | Rating | Notes |
|---|---|---|
| **Reliability** | A- (4.5/5) | 701/701 tests passing across 3 independent suites (454 Angular + 220 microservice + 27 backend). The one genuine defect this pass found (BAL-115 — `money.ts`'s own "only module allowed to construct a Decimal from a wire string" invariant bypassed at 3 call sites) was fixed same-day. No other logic bugs found. |
| **Security** | B- (3.4/5) | No injection/secrets exposure; parameterized SQL; CORS/headers/rate-limiting fixes from prior passes hold. Two new Minor hotspots found this pass (BAL-117 raw error echoing, BAL-118 no rate limit on the orchestrator). Held back by the two unchanged structural gaps: no authentication anywhere, and 8 High CVEs in production Angular deps. |
| **Maintainability** | B+ (3.8/5) | Duplication hotspots fixed and re-verified clean; the God Component now shares paging AND Look Up panel fetch logic (2 of 3 planned extractions done) but is still ~2,800 lines; two new small code smells found (BAL-116 unused `zod` dependency, BAL-119 dead redundant export re-assignment). |
| **Coverage** | A+ (5/5) | All 3 suites clear a **95%** floor on statements/branches/functions/lines. |
| **Duplication** | A (4.6/5) | Every previously-identified hotspot remains fixed; no new SonarQube-flaggable duplication block found in this pass's fresh sweep of all three sub-projects. |

### Composite score: **86 → 88 / 100 (B+ → A-)**

**Final assessment: CONDITIONAL PASS.** The codebase continues to improve on maintainability, security
hygiene, duplication, and now reliability — every finding this review can independently confirm was
fixed in a prior pass (BAL-101, BAL-103, BAL-104, BAL-106, BAL-107) still holds under fresh
re-verification, and this pass's own newly-found Major defect (BAL-115) was fixed the same day, not left
open. Several new Minor issues (BAL-116–BAL-120) remain, which is why the score isn't higher still. It
remains **NOT production-ready as-is**: BAL-001 (no authentication) and BAL-002 (dependency CVEs) are
unchanged release blockers for any deployment handling real trade-finance data. See
[Gate Conditions](#gate-conditions-before-any-production-consideration) at the end.

---

## Table of Findings (priority order)

| ID | Severity | Category | Title |
|---|---|---|---|
| [BAL-001](#bal-001) | 🔴 Blocker | Vulnerability | No authentication/authorization anywhere in the microservice |
| [BAL-002](#bal-002) | 🟠 Critical | Vulnerability | 8 High-severity CVEs in production Angular dependencies |
| [BAL-115](#bal-115) | 🟡 Major | Bug | `money.ts`'s "only module allowed to construct a Decimal from a wire string" invariant is bypassed at 3 call sites — **Fixed** |
| [BAL-003](#bal-003) | 🟡 Major | Code Smell | `transaction-builder.component.ts` is still a 2,809-line God Component (2 of 3 extractions done) |
| [BAL-102](#bal-102) | 🟡 Major | Technical Debt | SQLite whole-file locking blocks per-instrument concurrency — deferred, user-confirmed |
| [BAL-116](#bal-116) | 🔵 Minor | Code Smell | `zod` is a declared dependency but never used — request validation is manual presence checks only |
| [BAL-117](#bal-117) | 🔵 Minor | Security Hotspot | Both Express services' 500 handlers echo raw internal error messages to the client |
| [BAL-118](#bal-118) | 🔵 Minor | Security Hotspot | No rate limiting on `backend/server.js`'s own endpoints |
| [BAL-108](#bal-108) | 🔵 Minor | Code Smell | Residual `any` typing inside `transaction-builder.component.ts` — partially fixed |
| [BAL-119](#bal-119) | 🔵 Minor | Code Smell | Dead redundant re-assignment onto `module.exports` in `backend/server.js` |
| [BAL-105](#bal-105) | 🔵 Minor | Code Smell | ESLint/Prettier configured project-wide, but `format:check` not yet applied/enforced |
| [BAL-120](#bal-120) | ⚪ Info | Reliability | Idempotency detection relies on string-matching the SQLite driver's error text |
| [BAL-109](#bal-109) | ⚪ Info | Reliability | A handful of provably-dead defensive branches, left uncovered on purpose |
| [BAL-110](#bal-110) | ⚪ Info | Design Risk | Two independently-maintained domain-enum sources of truth |
| [BAL-101](#fixed-in-prior-passes--re-verified-still-fixed-this-pass) | — | — | Fixed in prior passes, re-verified still fixed this pass (see below) |
| [BAL-111](#bal-111) | ⚪ Info (positive) | — | SQL access is fully parameterized — no injection risk found, in either store layer |
| [BAL-112](#bal-112) | ⚪ Info (positive) | — | Test coverage clears 95% on all four metrics, all three suites |
| [BAL-113](#bal-113) | ⚪ Info (positive) | — | Strict TypeScript compiler flags enabled project-wide |
| [BAL-121](#bal-121) | ⚪ Info (positive) | — | Zero secrets, TODO markers, stray console output, or XSS-risk patterns across all three sub-projects |

---

## Vulnerabilities & Security Hotspots

### BAL-001
**No authentication/authorization anywhere in the Balance Component microservice** — 🔴 Blocker (if deployed beyond prototype use)

**Evidence:** `grep -rli "jwt|passport|express-session|authenticate(" microservices/balance-component/src backend` — **zero matches**, re-confirmed this pass, unchanged from every prior review. Every Maker/Checker field (`createdBy`, `releasedBy`, `acknowledgedBy`, `cancelledBy`) is still a free-text string the caller supplies on the request body.

This is a **known, explicitly accepted scope decision**, not an oversight — `lc-balance-wc/CLAUDE.md`'s own decision log: *"Maker=Checker segregation is a system-authorization concern, out of Balance Component's own scope"*. The finding is not that the decision was wrong for a prototype; it's that a **4-eyes control whose entire integrity model depends on knowing who acted has no way to actually know who acted**.

**Impact if exploited/deployed as-is:** any party with network access can create, release, reject, cancel, or acknowledge balance movements under any claimed identity — a complete integrity bypass of the Maker/Checker control the whole domain model is built around.

**Recommended remediation:** front the microservice with real authentication, derive `createdBy`/`releasedBy`/etc. from the verified identity server-side, and refuse to boot outside a dev/demo guard without an auth provider configured.

---

### BAL-002
**8 High-severity CVEs in production Angular dependencies** — 🟠 Critical

**Evidence** (`npm audit --omit=dev` from `lc-balance-wc/`, re-run fresh this pass, identical result to every prior one):

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

All advisories affect `@angular/core`/`@angular/compiler`/`@angular/animations`/`@angular/router`@17.3.x
and are genuine runtime-affecting XSS/cache-poisoning classes, not build-tooling noise. Explicitly deferred
across every prior remediation pass as too large/risky for a drive-by fix; that deferral still holds.

**Recommended remediation:** schedule an Angular major-version upgrade (17→22, incrementally via `ng update`) as its own dedicated piece of work, re-running `npm audit --omit=dev` and the full test suite after each step.

---

## Bugs

### BAL-115
**`money.ts`'s "only module allowed to construct a Decimal from a wire string" invariant is bypassed at 3 call sites** — 🟡 Major — **Fixed**

**Evidence:** `money.ts`'s own doc comment states it is the only module allowed to construct a `Decimal`
from a wire string, via `parseMonetaryAmount()`, which validates the input against
`MONETARY_AMOUNT_PATTERN = /^-?\d{1,18}(\.\d{1,3})?$/` before constructing the `Decimal` — this is the
service's one enforcement point for "no more than 3 decimal places, no exponential notation, no garbage
strings" on every monetary amount that enters the system. But:

```
$ grep -n "new Decimal(" src/service/balanceService.ts
287:        const requestedAmount = new Decimal(req.amount);
327:        const requestedAmount = new Decimal(req.amount);
375:      const check = checkAmendDecreaseSufficiency({ amount: new Decimal(req.amount), ceilingAmount, availableBalance: available });
```

All three call sites construct a `Decimal` directly from `req.amount` (the raw request field), bypassing
`parseMonetaryAmount()` entirely. Upstream validation in `routes/balanceMovements.ts` only checks
*presence* (`if (!body.amount) throw ...`), never *format* — confirmed via direct read of that route file.

**Impact:** an `amount` value that decimal.js will happily parse but `MONETARY_AMOUNT_PATTERN` would have
rejected — more than 3 decimal places, exponential notation (e.g. `"1e5"`), a leading `+`, or other
decimal.js-tolerant-but-out-of-contract input — skips the intended 400 `REQUEST_VALIDATION_FAILED`
rejection at the boundary entirely. It instead flows straight into SG-Issue-cap and AMEND_DECREASE
sufficiency arithmetic (both business-critical checks per this project's own `CLAUDE.md` decision log), and
may only surface later — either as a less-diagnosable `InvalidMonetaryAmountError` when
`formatMonetaryAmount()` re-serializes it for a response, or as a silently-persisted out-of-contract value
if it never gets re-serialized before being written to `BalanceMovement.ceilingAmount`/similar.

**Recommended remediation:** replace all three call sites with `parseMonetaryAmount(req.amount)`, matching
the convention every other call site in the domain layer already follows.

**Outcome (2026-08-16): Fixed, same day as the finding, user-requested ("Fix BAL-115 too").** All three
call sites (SG Issue vs. parent LC Tight Available Balance, Present Docs earmark vs. parent Confirmation,
AMEND_DECREASE sufficiency) now call `parseMonetaryAmount(req.amount)` instead of `new Decimal(req.amount)`
— a new `import { parseMonetaryAmount } from '../money';` in `balanceService.ts`. `new Decimal(0)`
(zero-initializing `offBalanceExposure`, not derived from any wire string) was correctly left alone —
out of scope for this finding. New `test/unit/service/balanceService.test.ts` (previously no dedicated
direct-service-call test file existed) proves the invariant holds even for a caller that constructs
`BalanceService` directly and bypasses `routes/balanceMovements.ts`'s own request-boundary validation
entirely — a separate, earlier same-day fix already added a currency-decimal-place + pattern check at
that HTTP boundary (see `lc-balance-wc/CLAUDE.md`'s decision log), but that only protects real HTTP
traffic; this closes the identical gap at the service layer itself, for any caller (test or otherwise)
that skips the route — 3 new tests, one per call site, each asserting
`InvalidMonetaryAmountError` where a malformed amount used to silently construct a `Decimal`. Verified:
`npm run typecheck`/`npm run build` clean; `npm test` → 220/220 passing (3 new),
98.97%/95.75%/100%/99.33% coverage; `npm run lint` 0 errors. Full three-suite re-verification: Angular
app 454/454 and `backend/` 27/27, both unaffected (microservice-only change).

---

## Technical Debt

### BAL-102
**SQLite whole-file locking blocks per-instrument concurrency** — 🟡 Major (Technical Debt) — Deferred, user-confirmed

**Evidence:** `microservices/balance-component/src/db/index.ts`'s own doc comment, re-verified accurate this pass: SQLite locks at the whole-database-file level even under WAL — cannot demonstrate the design doc §6 requirement that different logical contracts never block each other; every write serializes globally.

**Outcome: Deferred, no action — explicitly user-confirmed** in the prior remediation pass (no PostgreSQL instance available in this sandboxed environment to develop/test a real fix against). Re-confirmed unchanged this pass — this remains a **gate condition**, not a closed finding. See [Gate Conditions](#gate-conditions-before-any-production-consideration).

---

## Code Smells & Maintainability

### BAL-003
**`transaction-builder.component.ts` is still a 2,809-line God Component** — 🟡 Major (2 of 3 planned extractions done)

**Evidence:**
```
$ wc -l src/app/transaction-builder/transaction-builder.component.ts
2809

$ grep -o "if (\|else if\|&&\|||\| ? \|case " src/app/transaction-builder/transaction-builder.component.ts | wc -l
357   # decision points — a rough cyclomatic-complexity proxy

40 public methods (grep -c "^  [a-zA-Z].*(.*): (void|.*) {" as a proxy)
```
One class still owns: function/side selection, three independently-paginated catalog/parent/IB-index
pickers (sharing `loadPagedCatalog()`), natural-key search, the Maker `submit()` dispatch across all 14
named business functions, the Checker's compound release/reject/acknowledge/cancel logic (~195 lines,
untouched), and the Look Up panel (sharing `loadSnapshotAndMovements()`/`loadUnderLookupCandidates()`,
confirmed present at lines 569/2677/2698 and confirmed working — only 1 hit remains for the shared
error-format expression across the whole file, meaning no leftover duplicate call sites from either
extraction).

**Why it's still Major, not resolved:** the God Component itself — one class doing five or six genuinely
separate jobs — is still there. The one remaining planned extraction (Checker actions:
submit/release/reject/cancel/acknowledge, ~800+ lines of actual money-moving/state-transition logic) is
**deliberately still deferred** — unlike the two extractions already done (paging, Look Up panel), there's
no "guard/params unchanged, only the fetch/populate body moves" shape available for a block this large and
business-critical without a dedicated reviewer-scoped design pass first.

**Recommended remediation, in priority order (2 of 3 done):**
1. ~~Shared paging state machine for the three near-identical pickers.~~ **Done** — `loadPagedCatalog()`.
2. ~~A standalone extraction for the LC/Acceptance/SG Look Up tabs.~~ **Done** — `loadSnapshotAndMovements()` + `loadUnderLookupCandidates()`.
3. A `ChecklistActionsComponent` (or service) for submit/release/reject/cancel/acknowledge. **Deliberately deferred — needs a reviewer-scoped design pass before attempting.**

---

### BAL-116
**`zod` is a declared dependency but never used — request validation is manual presence checks only** — 🔵 Minor

**Evidence:**
```
$ grep -rn "from 'zod'" microservices/balance-component/src
(no matches)

$ grep -n "zod" microservices/balance-component/package.json
    "zod": "^3.23.8"

$ grep -n "amount" microservices/balance-component/src/routes/balanceMovements.ts
    if (!body.instrumentType || !body.movementType || body.eventSeq === undefined || !body.amount || !body.currency || !body.createdBy) {
      throw new RequestValidationError('instrumentType, movementType, eventSeq, amount, currency, createdBy are required.');
```
`zod` is paid for in `package.json` but never imported anywhere in `src/`; there is no
`src/validation/requestSchema.ts` or equivalent. Request validation is a single hand-rolled
property-presence check — it catches missing fields but not wrong-shaped ones (a numeric `eventSeq` typed
as a string, an enum field with a value outside its legal set, etc. — all still pass this check and reach
domain code). The specific `amount`-shape gap this originally flagged (alongside BAL-115) is now closed:
the route since gained explicit `MONETARY_AMOUNT_PATTERN`/currency-decimal-place checks of its own (see
`lc-balance-wc/CLAUDE.md`'s decision log) and BAL-115's fix closed the same gap again at the service
layer — but those are two hand-rolled checks bolted onto the route, not a schema, so this finding (no
actual validation layer exists, just accumulating one-off checks) still stands on its own merits.

**Impact:** no direct risk from the unused dependency itself, but it's misleading — a reader reasonably
assumes `zod` is the validation layer given it's declared as a dependency, and it isn't. The accumulating
hand-rolled checks in `balanceMovements.ts` are exactly the kind of growth a real schema would consolidate.

**Recommended remediation:** either wire an actual `zod` schema (the dependency is already paid for, and
would also consolidate the route's now-several hand-rolled checks — presence, pattern, currency-scale —
into one declarative place), or remove it from `package.json` if manual checks are the deliberate,
permanent choice.

---

### BAL-117
**Both Express services' 500 handlers echo raw internal error messages to the client** — 🔵 Minor (Security Hotspot)

**Evidence, microservice** (`microservices/balance-component/src/app.ts:39`):
```ts
res.status(500).json({ code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Unknown error' });
```
**Evidence, backend** (`backend/server.js`, `resolveLogicalContractId` + the `/run` route handler):
```js
// resolveLogicalContractId:
throw new Error(`Could not resolve logicalContractId for "${ref}": ${JSON.stringify(snap.body)}`);
// route handler:
res.status(500).json({ code: 'ORCHESTRATION_ERROR', message: err instanceof Error ? err.message : String(err) });
```
Both services relay their own internal error message verbatim into the HTTP response body — in the
backend's case, this includes the *microservice's own* error response body re-serialized into the
message string, a second layer of the same pattern. Combined with BAL-001 (no authentication anywhere),
any caller can trigger a 500 and read back internal error detail (e.g. a driver-level error, an internal
object shape) with nothing gating who can do so.

**Impact:** low today — no secrets currently flow through either error path — but a live information-exposure hotspot that grows the moment either service's internals produce a message containing anything sensitive.

**Recommended remediation:** in both services, log the detailed message server-side (already happening via `console.error`) and return a generic message (plus a request/trace ID if one exists) to the client instead.

---

### BAL-118
**No rate limiting on `backend/server.js`'s own endpoints** — 🔵 Minor (Security Hotspot)

**Evidence:** `grep -rn "rate-limit" backend --include=*.js` → no hits. The microservice has a scoped
rate limiter on `/balance-movements` (120 req/min, from a prior remediation pass), but the orchestrator
sitting in front of it — including `POST /api/business-cases/:id/run`, which can fan out into a multi-step
cascade of downstream microservice calls per single incoming request — has none.

**Impact:** low for a single-process prototype demo, but this endpoint is the one with the highest
amplification factor in the whole stack (one request → N downstream calls), making it the more natural
target for basic abuse protection than the individual `/balance-movements` calls it eventually triggers.

**Recommended remediation:** mirror the microservice's own scoped `express-rate-limit` on `/api/business-cases/:id/run`.

---

### BAL-108
**Residual `any` typing inside `transaction-builder.component.ts`** — 🔵 Minor — Partially Fixed

**Evidence:**
```
$ grep -c ": any\|<any>\|as any\|any\[\]" src/app/transaction-builder/transaction-builder.component.ts
37   (down from 43 two passes ago)

$ grep -c ": any\|<any>\|as any\|any\[\]" src/app/transaction-builder/balance-component-api.service.ts src/app/business-case-runner/balance-case-api.service.ts
1 each — both API service boundaries are essentially clean
```
The client↔server **API boundary** is typed; what remains is `any` usage inside the component's own
fields (`payableMovements: any[]`, `checkerItems: any[]`, etc.) — 5 fields left `any` on purpose in a prior
pass after retyping them broke existing test fixtures that intentionally construct partial objects for
exactly those fields (see the prior remediation pass's own notes in this project's `CLAUDE.md`).

**Recommended remediation:** retype the remaining 5 fields incrementally, one field + its fixture rewrites
at a time, rather than as a single sweep.

---

### BAL-119
**Dead redundant re-assignment onto `module.exports` in `backend/server.js`** — 🔵 Minor

**Evidence:**
```js
module.exports = { app, runCase, resolveLogicalContractId, callMicroservice };
module.exports.runCase = runCase;
module.exports.resolveLogicalContractId = resolveLogicalContractId;
module.exports.callMicroservice = callMicroservice;
```
The object literal already assigns all three named properties; the three lines below it re-assign
properties that already exist with the identical value — a no-op left over from the BAL-107 fix (which
correctly changed the export *shape*, but didn't clean up the now-redundant lines that used to be the
*only* way those properties got attached).

**Impact:** none functionally — purely a readability smell that makes the intent look more complicated
than it is (a future reader may assume the extra lines do something).

**Recommended remediation:** delete the three redundant lines; `module.exports = { app, runCase, resolveLogicalContractId, callMicroservice };` alone is sufficient.

---

### BAL-105
**ESLint/Prettier configured project-wide, but `format:check` not yet applied/enforced** — 🔵 Minor

**Evidence:** All three sub-projects have a working `eslint.config.js` + `.prettierrc.json` and pass
`npm run lint` with 0 errors (Angular: 227 warnings, all `no-explicit-any`; microservice: 6 warnings;
backend: 2 warnings — all pre-existing, none newly introduced). However:
```
$ cd backend && npm run format:check
9 files flagged (server.js, data/businessCases.js, all three test files, eslint.config.js, ...)
```
Same caveat this finding has carried since it was first fixed: the tooling exists and the lint gate is
real, but a repo-wide `prettier --write` pass has never actually been run, so `format:check` still flags
pre-existing files. Not a regression — accurately reported as still-open the same way in every pass since
BAL-105 was first "Fixed."

**Recommended remediation:** run `prettier --write` across all three sub-projects as its own isolated
commit (so it doesn't obscure a real code change in a mass-reformat diff), then optionally wire
`lint`/`format:check` into CI.

---

## Reliability & Design Risk

### BAL-120
**Idempotency detection relies on string-matching the SQLite driver's error text** — ⚪ Info

**Evidence:** `microservices/balance-component/src/store/balanceMovementStore.ts:164` —
`/UNIQUE constraint failed/.test(message)` is how a resubmission against the same
`(balanceContractId, eventSeq)` is detected and routed to `findByContractAndEventSeq()` instead of
throwing. Works correctly today (covered by tests) but is fragile against a future `node:sqlite` version
changing its error message format, since it matches message text rather than a stable driver error code.

**Recommended remediation:** not urgent; if `node:sqlite` ever exposes a stable error code/type for
constraint violations, prefer that over message-text matching.

---

### BAL-109
**A handful of provably-dead defensive branches, left uncovered on purpose** — ⚪ Info

**Evidence, re-confirmed this pass:**
- `microservices/balance-component/src/domain/balanceDerivation.ts:101` — `computeFaceAmount`'s
  `direction === undefined` throw is unreachable because `FACE_AMOUNT_MOVEMENT_TYPES` is a strict subset of
  `MOVEMENT_DIRECTION`'s own keys.
- `backend/server.js`'s `require.main === module` guard around `app.listen()` — structurally only true
  when the file is run directly, never when `require`d by a test.

Both identified and left intentionally uncovered, with reasoning documented inline at each site — a
SonarQube-style scan would flag these as unreachable code; the existing judgment not to force-cover or
delete them is reasonable and unchanged.

---

### BAL-110
**Two independently-maintained domain-enum sources of truth** — ⚪ Info

**Evidence:** `src/app/transaction-builder/balance-component.model.ts` (Angular) and
`microservices/balance-component/src/types.ts` (server) each independently declare the `InstrumentType`
union and legal-movementType-per-instrument tables. Architecturally normal for a decoupled client/server
pair, but a schema-drift risk class: nothing currently detects if one side adds/renames a value without
the other following. The two remain in sync as of this review.

**Recommended remediation:** not urgent given low current change frequency; a small contract test would
catch drift cheaply if it becomes a problem.

---

## Fixed in Prior Passes — Re-Verified Still Fixed This Pass

### BAL-101, 103, 104, 106, 107 — Fixed
- **BAL-101** (`dualInstrumentFallback` dead code) — removed; re-confirmed absent from both
  `balance-component.model.ts` and `transaction-builder.component.ts`.
- **BAL-103** (CORS allow-any-origin) — `backend/server.js` re-confirmed using an explicit
  `ALLOWED_ORIGINS` allow-list, not bare `cors()`.
- **BAL-104** (no security headers/rate limiting) — `helmet()` re-confirmed applied in both
  `backend/server.js` and the microservice's `app.ts`; the microservice's rate limiter re-confirmed
  correctly scoped to `/balance-movements` only, not interfering with read-heavy catalog/lookup traffic.
- **BAL-106** (hand-rolled migration) — `src/db/migrations.ts`'s `schema_migrations` tracking table +
  ordered `Migration[]` runner re-confirmed in place and passing its own dedicated test file.
- **BAL-107** (test-only internals on the Express app export) — `backend/server.js` re-confirmed exporting
  `{ app, runCase, resolveLogicalContractId, callMicroservice }` as a plain object (see BAL-119 above for
  a small residual smell left over from this same fix, not a regression of the fix itself).

---

## Positive Findings

### BAL-111
**SQL access is fully parameterized — no injection risk found, in either store layer.** 16 `.prepare()`
calls across `src/store/*.ts`, all using `?`/`@named` binds, re-verified this pass — including the
dynamically-assembled `WHERE` clause in `balanceContractStore.ts`'s `listCatalog()`, whose clause
*fragments* are hardcoded literals from a fixed set, never derived from caller input.

### BAL-112
**Test coverage clears 95% on all four metrics, across all three independent suites.** 701 tests total,
all green as of this review (microservice count includes the currency-decimal-place and BAL-115 fixes'
own new tests, landed the same review date):

| Suite | Statements | Branches | Functions | Lines | Tests |
|---|---|---|---|---|---|
| `microservices/balance-component/` | 98.97% | 95.75% | 100% | 99.33% | 220 |
| `backend/` | 97.95% | 97.36% | 95.65% | 97.75% | 27 |
| Angular app (`src/app/`) | 99.76% | 95.57% | 99.67% | 99.82% | 454 |

All three also pass their own lint gate clean (0 errors) and typecheck/build clean
(`tsc --noEmit`, `npm run build` for the microservice; `ng build --configuration development` for the
Angular app).

### BAL-113
**Strict TypeScript compiler flags enabled project-wide** — both `lc-balance-wc/tsconfig.json` and
`microservices/balance-component/tsconfig.json` set `strict: true` plus `noImplicitOverride`,
`noPropertyAccessFromIndexSignature`, `noImplicitReturns`, and `noFallthroughCasesInSwitch`.

### BAL-121
**Zero secrets, TODO markers, stray console output, or XSS-risk patterns across all three sub-projects.**
Re-verified fresh this pass, independently, in each sub-project:
- `grep -rn "TODO\|FIXME\|XXX"` → zero matches in `src/app`, `backend` (excl. node_modules/coverage), and
  `microservices/balance-component/src`+`test`.
- `grep -rn "console\.\(log\|debug\)"` → zero matches anywhere except the expected startup banners in
  `backend/server.js` and (structurally uncovered, see BAL-109) the direct-run guard.
- `grep -rn "innerHTML\|bypassSecurityTrust"` → zero matches in `src/app`.
- `grep -rniE "api[_-]?key|secret|password|token"` → zero matches anywhere that isn't a normal domain
  field name (`createdBy`, `releasedBy`, etc.).
- The recent Transaction-Builder/Business-Case-Runner route swap (`/` ↔ `/business-cases`) is fully
  consistent between `app.routes.ts` and `app.component.ts`, with zero stale `/transactions` references
  left anywhere in `src/app`.

---

## Gate Conditions Before Any Production Consideration

This codebase earns its **CONDITIONAL PASS** for continued prototype/demo development. Before this project
(or any component of it) is considered for a deployment handling real trade-finance data or real user
credentials, the following remain non-negotiable, in this order:

1. **BAL-001** — real authentication, with `createdBy`/`releasedBy`/etc. derived server-side from a
   verified identity, not trusted from the request body.
2. **BAL-002** — Angular upgraded off the CVE-affected 17.3.x line.
3. **BAL-102** — the SQLite→PostgreSQL engine swap, if this project's storage layer is ever promoted
   beyond prototype use.

**BAL-115 (the monetary-amount parsing bypass) is fixed as of this pass** — no longer a gate condition.

None of the remaining Maintainability/Minor/Info findings (BAL-003, BAL-105, BAL-108, BAL-116–BAL-120)
block a production decision on their own, but BAL-003's one remaining extraction (Checker actions) will
keep making every future change to that block riskier than necessary until it gets its own
reviewer-scoped design pass, and BAL-116/BAL-117 are worth closing opportunistically since the fix for
each is small and self-contained.
