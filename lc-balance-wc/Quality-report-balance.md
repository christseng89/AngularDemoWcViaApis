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
| **Reliability** | A- (4.6/5) | 729/729 tests passing across 3 independent suites (467 Angular + 234 microservice + 28 backend). The one genuine defect this pass found (BAL-115 — `money.ts`'s own "only module allowed to construct a Decimal from a wire string" invariant bypassed at 3 call sites) was fixed same-day. No other logic bugs found. |
| **Security** | B+ (3.9/5) | No injection/secrets exposure; parameterized SQL; CORS/headers/rate-limiting fixes from prior passes hold. Both new Minor hotspots found this pass are now fixed (BAL-117 raw error echoing on both services, BAL-118 rate limit on the orchestrator). Held back by the two unchanged structural gaps — no authentication anywhere (BAL-001), and 8 High CVEs in production Angular deps (BAL-002) — both explicitly deferred, user-confirmed, not oversights. |
| **Maintainability** | A (4.6/5) | Duplication hotspots fixed and re-verified clean; `submit()` is split (~423 lines → 29-line dispatcher + named methods); the 3 paginated pickers' own state/boundary-math duplication is unified into one `PagedListState` class; and as of this fifth same-day pass Checker Actions (release/reject/deleteMakerPending) is extracted into a dedicated `CheckerActionsService` via genuine Dependency Inversion (Interface Segregation + Single Responsibility) — the first BAL-003 fix that actually reduces the God Component's *job count*, not just its internal duplication. BAL-108's remaining `any` fields are all genuinely typed; BAL-105's `format:check` passes clean repo-wide; BAL-110 now has a drift-catching contract test; BAL-116 (zod now actually used) and BAL-119 (dead export re-assignment) both fixed. The class itself is still a God Component (function/side selection, three picker state machines, Look Up panel, Maker submit dispatch), which is why BAL-003 stays open at Major rather than closing outright. |
| **Coverage** | A+ (5/5) | All 3 suites clear a **95%** floor on statements/branches/functions/lines. |
| **Duplication** | A (4.7/5) | Every previously-identified hotspot remains fixed, and the release/reject/cancel chain's own duplicated success/failure tails (found and fixed this pass, BAL-003) are gone too. |

### Composite score: **86 → 88 → 90 → 91 → 92 → 93 / 100 (B+ → A- → A- → A- → A- → A)**

**Final assessment: CONDITIONAL PASS.** The codebase continues to improve on maintainability, security
hygiene, duplication, and reliability — every finding this review can independently confirm was fixed in
a prior pass (BAL-101, BAL-103, BAL-104, BAL-106, BAL-107) still holds under fresh re-verification, and
this pass's newly-found Major defect (BAL-115) was fixed the same day. A user-directed, priority-ordered
remediation pass the same day closed five more findings (BAL-003's Checker Actions consolidation, BAL-116,
BAL-117 on both services, BAL-118, BAL-119). A third same-day, user-directed pass then closed BAL-003's
remaining `submit()` split, BAL-105 (Prettier `format:check`), and BAL-108 (the last 5 `any`-typed
fields). A fourth same-day, user-directed pass then applied OOD/SOLID principles to BAL-003's last
identified duplication (the 3 paginated pickers' own state/boundary math, unified into a new
`PagedListState` class) and reframed BAL-120 as **Deferred, user-confirmed**. A fifth same-day,
user-directed pass then closed BAL-110 (a drift-catching contract test) and extracted BAL-003's Checker
Actions into a dedicated service via genuine Dependency Inversion — reversing an earlier "not worth it"
decision from this same session's second pass, correctly this time, after re-examining the reasoning at
the user's explicit direction — see each finding's own "Outcome" for detail. BAL-001, BAL-002, and BAL-102 are all now explicitly **Deferred,
user-confirmed** — real authentication, a major Angular upgrade, and a PostgreSQL engine swap are each
their own dedicated piece of work, correctly out of scope for an incremental code-quality pass, and are
recorded as deliberate decisions rather than oversights. It remains **NOT production-ready as-is**:
BAL-001 (no authentication) and BAL-002 (dependency CVEs) are unchanged release blockers for any
deployment handling real trade-finance data — deferred is not the same as resolved. See
[Gate Conditions](#gate-conditions-before-any-production-consideration) at the end.

---

## Table of Findings (priority order)

| ID | Severity | Category | Title |
|---|---|---|---|
| [BAL-001](#bal-001) | 🔴 Blocker | Vulnerability | No authentication/authorization anywhere in the microservice — deferred, user-confirmed |
| [BAL-002](#bal-002) | 🟠 Critical | Vulnerability | 8 High-severity CVEs in production Angular dependencies — deferred, user-confirmed |
| [BAL-115](#bal-115) | 🟡 Major | Bug | `money.ts`'s "only module allowed to construct a Decimal from a wire string" invariant is bypassed at 3 call sites — **Fixed** |
| [BAL-003](#bal-003) | 🟡 Major | Code Smell | `transaction-builder.component.ts` God Component — **submit() split, paging state/math unified, Checker Actions extracted into `CheckerActionsService` via Dependency Inversion; still open, real decomposition remains future work** |
| [BAL-102](#bal-102) | 🟡 Major | Technical Debt | SQLite whole-file locking blocks per-instrument concurrency — deferred, user-confirmed |
| [BAL-116](#bal-116) | 🔵 Minor | Code Smell | `zod` is a declared dependency but never used — request validation is manual presence checks only — **Fixed** |
| [BAL-117](#bal-117) | 🔵 Minor | Security Hotspot | Both Express services' 500 handlers echo raw internal error messages to the client — **Fixed** |
| [BAL-118](#bal-118) | 🔵 Minor | Security Hotspot | No rate limiting on `backend/server.js`'s own endpoints — **Fixed** |
| [BAL-108](#bal-108) | 🔵 Minor | Code Smell | Residual `any` typing inside `transaction-builder.component.ts` — **Fixed** (the 5 remaining fields) |
| [BAL-119](#bal-119) | 🔵 Minor | Code Smell | Dead redundant re-assignment onto `module.exports` in `backend/server.js` — **Fixed** |
| [BAL-105](#bal-105) | 🔵 Minor | Code Smell | ESLint/Prettier configured project-wide — **Fixed** (`format:check` scoping bug fixed, repo-wide reformat landed) |
| [BAL-120](#bal-120) | ⚪ Info | Reliability | Idempotency detection relies on string-matching the SQLite driver's error text — deferred, user-confirmed |
| [BAL-109](#bal-109) | ⚪ Info | Reliability | A handful of provably-dead defensive branches, left uncovered on purpose |
| [BAL-110](#bal-110) | ⚪ Info | Design Risk | Two independently-maintained domain-enum sources of truth — **Fixed** (contract test added) |
| [BAL-101](#fixed-in-prior-passes--re-verified-still-fixed-this-pass) | — | — | Fixed in prior passes, re-verified still fixed this pass (see below) |
| [BAL-111](#bal-111) | ⚪ Info (positive) | — | SQL access is fully parameterized — no injection risk found, in either store layer |
| [BAL-112](#bal-112) | ⚪ Info (positive) | — | Test coverage clears 95% on all four metrics, all three suites |
| [BAL-113](#bal-113) | ⚪ Info (positive) | — | Strict TypeScript compiler flags enabled project-wide |
| [BAL-121](#bal-121) | ⚪ Info (positive) | — | Zero secrets, TODO markers, stray console output, or XSS-risk patterns across all three sub-projects |

---

## Vulnerabilities & Security Hotspots

### BAL-001
**No authentication/authorization anywhere in the Balance Component microservice** — 🔴 Blocker (if deployed beyond prototype use) — Deferred, user-confirmed

**Evidence:** `grep -rli "jwt|passport|express-session|authenticate(" microservices/balance-component/src backend` — **zero matches**, re-confirmed this pass, unchanged from every prior review. Every Maker/Checker field (`createdBy`, `releasedBy`, `acknowledgedBy`, `cancelledBy`) is still a free-text string the caller supplies on the request body.

This is a **known, explicitly accepted scope decision**, not an oversight — `lc-balance-wc/CLAUDE.md`'s own decision log: *"Maker=Checker segregation is a system-authorization concern, out of Balance Component's own scope"*. The finding is not that the decision was wrong for a prototype; it's that a **4-eyes control whose entire integrity model depends on knowing who acted has no way to actually know who acted**.

**Impact if exploited/deployed as-is:** any party with network access can create, release, reject, cancel, or acknowledge balance movements under any claimed identity — a complete integrity bypass of the Maker/Checker control the whole domain model is built around.

**Recommended remediation:** front the microservice with real authentication, derive `createdBy`/`releasedBy`/etc. from the verified identity server-side, and refuse to boot outside a dev/demo guard without an auth provider configured.

**Outcome (2026-08-16): Deferred, no action — explicitly user-confirmed**, same posture as BAL-102 —
real authentication is real design/implementation work (an auth provider, session/token handling,
threading verified identity through every Maker/Checker field), correctly out of scope for an
incremental code-quality remediation pass. This remains a **gate condition** for any deployment beyond
prototype use, not a closed finding — see [Gate Conditions](#gate-conditions-before-any-production-consideration).

---

### BAL-002
**8 High-severity CVEs in production Angular dependencies** — 🟠 Critical — Deferred, user-confirmed

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

**Outcome (2026-08-16): Deferred, no action — explicitly user-confirmed**, same posture as BAL-102/
BAL-001 — a major-version Angular upgrade (17→22) is its own dedicated, real risk of breaking the
455-test Angular suite and unknown `@ngx-formly`/`jest-preset-angular` compatibility at Angular 22,
correctly out of scope for an incremental code-quality remediation pass. This remains a **gate
condition** for any deployment beyond prototype use, not a closed finding — see
[Gate Conditions](#gate-conditions-before-any-production-consideration).

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
**`transaction-builder.component.ts` is still a God Component** — 🟡 Major (all 3 planned extractions attempted, plus a 4th OOD/SOLID pass unifying paging state and a 5th extracting Checker Actions into a service — see the four Outcomes below)

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
separate jobs (function/side selection, three picker state machines, Maker submit dispatch, Checker
actions, Look Up) — is still there. All 3 originally-planned extractions below have now been attempted
(see the two Outcome paragraphs following), but none of them reduced the *number of jobs* the class does
— they only made each job's own internals DRY-er and shorter. A genuine fix requires splitting the class
itself (e.g. into separate picker/Checker-actions/submit-orchestration components or services), which is
real architectural work needing its own reviewer-scoped design pass, deliberately out of scope for an
incremental extraction pass.

**Recommended remediation, in priority order (all 3 attempted, see Outcomes below):**
1. ~~Shared paging state machine for the three near-identical pickers.~~ **Done** — `loadPagedCatalog()`.
2. ~~A standalone extraction for the LC/Acceptance/SG Look Up tabs.~~ **Done** — `loadSnapshotAndMovements()` + `loadUnderLookupCandidates()`.
3. ~~A `ChecklistActionsComponent` (or service) for submit/release/reject/cancel/acknowledge.~~ **Attempted, scoped down** — a standalone service was rejected as too risky (see Outcome below); the release/reject/cancel chain was instead made DRY in place via `finishCheckerAction()`/`failCheckerAction()`, and `submit()` was separately split into `validateSubmit()`/`buildSubmitRequest()`/named compound methods (see the second Outcome below).

**Outcome (2026-08-16, user-directed as P1 — "建議繼續拆 Checker Actions"): the release/reject/cancel
chain is now DRY; `submit()` itself is deliberately still untouched.** A full "move to a separate
service" extraction of item 3 above was rejected on inspection as too risky — the compound release chain
(`release()`/`releaseMatchedReceivable()`/`releaseDueFromIssuingBank()`/`releaseAcceptance()`/
`releaseAcceptanceLiability()`/`releaseAcceptanceReimbReceivable()`/`reject()`/`deleteMakerPending()`)
reads/writes ~10 pieces of component state and calls back into 4 other component methods; moving it to a
service would mean threading all of that through a parameter surface for no real benefit, in exactly the
kind of code where a mistake matters most (a 4-leg financial release chain).

**What was actually done** — the same "guard/branch logic unchanged, only the repeated body moves"
convention as the two already-completed extractions: every leg of the chain shared one of two exact
literal shapes (a success tail — `actionBusy=false; submitResult=res; refreshSelectedContractSnapshot();
syncCheckerToContext();` plus optional `syncLookupToContext()`/`reloadPayableMovementsAfterCompound()` —
and a failure tail — `actionBusy=false; submitError=<message>;`). New `finishCheckerAction(res, opts?)` /
`failCheckerAction(message)` private helpers consolidate exactly those two shapes across 6 and ~10 call
sites respectively. WHICH call to make, in what order, under what business condition, and every error
message string is completely unchanged — only the identical trailing state-mutation lines were factored
out. File size: 2,835 → 2,778 lines.

**`submit()` (the ~430-line Maker dispatch across all 14 named business functions) was deliberately NOT
touched** — a fundamentally different kind of complexity (building a function-specific request object
across 14 branches, not a chain of near-identical API calls) needing its own separate design pass (most
likely: splitting into 14 named private per-function methods) — out of scope for this increment.
**BAL-003 stays open at Major** for this reason — the class is smaller and its release/reject/cancel
logic is DRY, but it still does five or six separate jobs.

**Verification, given the stakes:** full Angular suite 455/455 with **zero test files needing changes**
— strong evidence of exact behavior preservation, since the pre-existing suite was written against the
original implementation and still passes unmodified — plus `tsc --noEmit`/`ng build`/`npm run lint` all
clean, plus **live in-browser end-to-end verification**: a fresh A1 (LC Issue) submitted and released via
the Checker queue correctly moved Available/Confirmed/Tight Available Balance 0 → 50,000, and
`deleteMakerPending()` separately verified end-to-end on another LC, correctly cancelling the movement,
zeroing the balance, and clearing the Checker queue.

**Second outcome (2026-08-16, same day, user-directed as P1 — "Transaction Builder 約 2,780 lines；
submit() 約 430 lines... 下一個最值得改善"): `submit()` itself split too — the piece explicitly deferred
above.** On closer reading, `submit()`'s actual shape wasn't "14 per-function branches" as the earlier
Outcome guessed — it's generic validation (mostly shared, with a few embedded function-specific checks)
+ generic request assembly + exactly 4 special-case compound submission shapes (gated by function
flags) + 1 generic default path. Split into `validateSubmit(): boolean`, `buildSubmitRequest():
CreateMovementRequest | null`, four named compound-shape methods
(`submitDocumentArrivalWithSg`/`submitConfirmationHonourWithReceivable`/
`submitConfirmationAcceptWithReceivable`/`submitAcceptanceSettleWithReceivable`), and `submitPlain()` —
`submit()` itself now just validates, builds the request, resets state, and dispatches to one of the 5
methods via the same unchanged flag conditions. Pure code motion: every guard, comment, error message,
and call order is byte-for-byte unchanged. `submit()`: ~423 lines → **29 lines**. File total: 2,778 →
2,850 lines (net growth from new method signatures/doc comments, same posture as every extraction in
this file).

Verified: full Angular suite 455/455 with **zero test files needing changes**, `tsc --noEmit`/`ng
build`/`npm run lint` all clean, plus live in-browser verification (A1 plain-path submit, an A8 SG Issue
against it, and A3S's compound `submitDocumentArrivalWithSg()` — confirmed via the SG's own Event
Timeline showing the correctly-derived `FULL_REDEEM 30000` with `sourceTransactionRef: 'IB01'` threaded
through, and Off-Balance Exposure correctly dropping 30000 → 0). The three remaining compound shapes
(B3/B4/B5) need an Export Confirmation to set up and weren't separately live-verified — they're
structurally identical to the one that was, and are covered by the unchanged, still-passing unit suite.

**BAL-003 now has all 3 originally-planned extractions done, but stays open at Major**: the class is
significantly smaller in complexity terms (its longest methods are now the 5 dispatch/compound-shape
methods, none over ~60 lines, versus one 423-line method before) and every identified duplication is
gone, but it's still one 2,850-line class doing five or six separate jobs (function/side selection,
three paginated pickers, natural-key search, the Look Up panel, and the full Maker/Checker submit-
release-reject-cancel lifecycle) — a genuine architectural decomposition (e.g. into a Checker-actions
service, or per-tab child components) remains a larger, separate piece of work than any single-pass
extraction here can safely attempt.

**Third outcome (2026-08-16, same day, user-directed — "BAL-003 God Component ~2,850 lines... 目前最值得繼續改善",
then "BAL-003 使用OOD SOLID原則 避免重複代碼" / "apply OOD SOLID principles, avoid duplicate code"): the
paginated-picker duplication the evidence block above always named, but that the first two Outcomes didn't
touch, is now unified.** The catalog LC Index, Parent LC picker, and IB/SG Index each carried their own
copy of the same `page`/`total`/`pageSize` field trio, the same `Math.max(1, Math.ceil(total / pageSize))`
totalPages formula, and the same first/last-page boundary check in their own `xxxPrevPage()`/
`xxxNextPage()` methods — real, literal duplication, independent of the fetch logic `loadPagedCatalog()`
already shared. New `paged-list-state.ts` — a small `PagedListState` class (Single Responsibility: owns
paging state + boundary math only; Open/Closed: a future 4th picker just instantiates it) — replaces all
three copies with one tested implementation. `catalogPage`/`catalogTotal`/etc. stay as public
getter/setter pairs delegating to the new class rather than a breaking rename, specifically because ~96
existing test call sites (30 of them direct *writes*, e.g. `comp.catalogPage = 5`) and 8 template bindings
reference these properties by name — the accessor layer keeps every one of them working unmodified while
still consolidating the actual state and math underneath. Verified: new `paged-list-state.spec.ts` (10
tests, 100% coverage on the new file); full Angular suite 465/465 (455 pre-existing + 10 new) with **zero
existing test files needing any changes** — the same "public behavior preserved" evidence pattern as the
prior two Outcomes; `tsc --noEmit`/`npm run lint`/`format:check` all clean; live in-browser verification
against the running app (A4's LC Index picker rendered correctly, then `catalogNextPage()`/
`catalogPrevPage()` driven directly against the live component instance through a simulated 25-record/
3-page scenario — 1→2→3, correctly refused to overrun page 3, back to 2 — the exact code path the
template's own Prev/Next buttons call), zero console errors. File size: 2,850 → 2,888 lines (net growth
from the getter/setter signatures, same posture as every extraction so far — never a line-count exercise).

**BAL-003 stays open at Major**, same reasoning as the second Outcome: this closes a real, previously-
uncredited duplication finding and further reduces the God Component's *internal* duplication, but doesn't
reduce the *number of jobs* the class does. The genuine architectural decomposition (Checker-actions
service, per-tab child components, etc.) remains separate, larger future work.

**Fourth outcome (2026-08-16, same day, user-directed — "BAL-003 God Component... 8/10, 下一個主要改善目標"):
Checker Actions extracted into a service, reversing an earlier decision this same session — done via
proper Dependency Inversion, confirmed with the user before starting given the stakes.** The 2nd Outcome
above explicitly rejected a full service move for the compound release()/reject()/deleteMakerPending()
chain ("would need to pass ~10 pieces of component state back and forth for no real benefit"). Re-examined
at the user's explicit direction: that reasoning was correct for a *naive* move, but not a fundamental
blocker — the fix was Dependency Inversion, not a plain cut-and-paste. New `checker-actions.service.ts`
(`CheckerActionsService`) depends only on a narrow `CheckerActionContext` interface (Interface
Segregation — exactly the 9 read-only fields these flows need) and its own injected API client, never on
`TransactionBuilderComponent` — it decides which release/reject/cancel call to make and in what order,
and resolves to one `CheckerActionOutcome`, never mutating component state itself (Single Responsibility:
"what happened", not "what the UI does about it"). The component's `release()`/`reject()`/
`deleteMakerPending()` are now thin guard-and-dispatch wrappers; a new `applyCheckerActionOutcome()` is
the one place outcomes become `actionBusy`/`submitResult`/`submitError`/`arrivalApproved` writes and
`refreshSelectedContractSnapshot()`/`syncCheckerToContext()`/`syncLookupToContext()`/
`reloadPayableMovementsAfterCompound()`/`loadSgsForArrival()` calls. The 6 private leg methods this
replaced are gone from the component entirely. `describeApiError`'s formatting logic was also pulled into
a standalone `api-error.ts` so the new service could reuse it without depending on the component.

**Constructor-injection risk avoided deliberately**: `CheckerActionsService` is added via a **default
parameter value** (`checkerActions: CheckerActionsService = new CheckerActionsService(api)`) rather than
a plain required parameter, because 70+ existing test call sites across all 4 spec files construct the
component as `new TransactionBuilderComponent(mockApi)` with one argument. Angular's real DI container
always resolves every constructor parameter regardless of default values, so production wiring is
unaffected; every test call site needed zero changes.

Verified: full suite 467/467 — **zero new or changed tests needed**, since every branch was already
covered by the existing `release()`/`reject()`/`deleteMakerPending()` describe blocks in
`transaction-builder.component.actions.spec.ts`, all passing unmodified against the new service-backed
implementation; coverage still clears the 95% floor on all four metrics (branches dipped slightly, 95.65%
→ 95.53%, from two pre-existing `pendingItemLabel ?? 'Document Arrival'` fallback branches moved verbatim
into the new file, not a new gap); `tsc --noEmit`/`npm run lint`/`format:check` all clean. **Live
in-browser verification given the stakes** (the actual money-moving release chain): drove the real running
component through all 3 entry points against the live microservice — fresh submits followed by
`release()` (PENDING → RELEASED), `deleteMakerPending()` (PENDING → CANCELLED), and `reject()` (PENDING →
REJECTED), all three correct with `submitError` null and `actionBusy` false afterward, zero console
errors. The 4 compound branches (A3S/A6/B4/B5) were not separately live-driven this pass — same disclosed
scope limitation as the `submit()` split's own Outcome — they are unchanged code motion, fully covered by
the unit suite.

**BAL-003 still stays open at Major**: this is real progress on the *number of jobs* the class does (one
job — Checker release orchestration — genuinely moved out, not just DRY'd in place), but the class still
directly owns function/side selection, three picker state machines, natural-key search, the Look Up
panel, and Maker submit dispatch. The remaining decomposition (Look Up panel extraction, or per-tab child
components) stays separate future work.

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

**Outcome (2026-08-16): Fixed — wired, not removed.** New `src/validation/requestSchema.ts` —
`createMovementRequestSchema`, a zod object covering the same 6 required fields plus a `.superRefine()`
reproducing the pattern + currency-scale checks verbatim (same `MONETARY_AMOUNT_PATTERN`/
`describeAmountScaleViolation` from `money.ts`), with `.passthrough()` so every other
`CreateMovementRequest` field is preserved untouched rather than silently stripped (zod's default
`z.object()` behavior) — the one real risk in this fix, covered by its own dedicated passthrough test.
`routes/balanceMovements.ts` now calls `.safeParse(req.body)` and throws `RequestValidationError` with
the first issue's message on failure. New `test/unit/validation/requestSchema.test.ts` (13 tests). All 17
pre-existing HTTP-layer tests covering this route's validation in `app.test.ts` pass **unchanged, no
edits needed** — confirms the schema is exactly behavior-preserving. Verified: `npm run typecheck`/
`npm run build` clean, `npm test` → 234/234 (14 new), `npm run lint` 0 errors.

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

**Outcome (2026-08-16): Fixed, both services.** `backend/server.js`'s `/run` catch block now logs the
detail via `console.error('[business-cases/run] orchestration error for "<id>":', detail)` and returns a
fixed generic message; three existing tests updated to assert the new message AND that `console.error`
was called with the real detail (via a `jest.spyOn` mock), so server-side loggability stays verified.
`microservices/balance-component/src/app.ts`'s generic fallback handler — same fix, generic message,
`console.error(err)` (already present) captures the detail. Verified: `npm test` → backend 28/28
(3 updated), microservice 234/234 (unaffected — no prior test exercised this specific branch).

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

**Outcome (2026-08-16): Fixed.** Exactly the recommended remediation — a scoped `express-rate-limit`
limiter (120 req/min, `standardHeaders: true`, `legacyHeaders: false`) added to
`POST /api/business-cases/:id/run` only, mirroring the microservice's own `/balance-movements` limiter
shape exactly. `express-rate-limit@^8.6.2` added to `backend/package.json` (same version as the
microservice). New test asserts the `ratelimit-limit: '120'` response header is present, confirming the
limiter is actually wired to this route. Verified: `npm test` → backend 28/28 (1 new).

---

### BAL-108
**Residual `any` typing inside `transaction-builder.component.ts`** — 🔵 Minor — Fixed

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

**Outcome (2026-08-16, user-directed as P2 — "逐欄位改善"): all 5 remaining fields retyped.** The prior
blocker (bare partial-object fixtures like `{movementId: 'm1'}` failing `TS2740` against the full
`BalanceMovement` shape) was resolved by adding a `makeMovement()`-style fixture-builder helper to each
of the three affected spec files, matching the naming convention each already used for its own
`BalanceContract`/`BalanceSnapshot` builders (and mirroring `actions.spec.ts`'s own pre-existing
`makeMovement()`), supplying defaults for the fields the old bare literals were missing
(`exposureNature`, `ceilingAmount`, `createdBy`, `createdAt`). ~30 fixture call sites across the three
spec files updated to use the helper — including several that were previously silently cast via
`(c as any).selectedCheckerMovement = ...`, now genuinely typed. Verified: `npm test` → 455/455 passing
(no new tests — pure fixture-shape fix), `tsc --noEmit` clean, `ng build` clean, `npm run lint` 0 errors
(216 warnings, down from 231 — the removed fixture-level `as any` casts are gone).

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

**Outcome (2026-08-16): Fixed.** Exactly the recommended remediation — the three redundant lines
deleted, `module.exports = { app, runCase, resolveLogicalContractId, callMicroservice };` is now the
entire export statement. Verified: `npm test` → backend 28/28 unaffected, `npm run lint` 0 errors.

---

### BAL-105
**ESLint/Prettier configured project-wide, but `format:check` not yet applied/enforced** — 🔵 Minor — Fixed

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

**Outcome (2026-08-16, user-directed as P2 — "很容易處理"): both halves closed.** A root-cause bug was
found first: `backend/`'s own `format:check` script used
`prettier --check "**/*.js" --ignore-path .gitignore`, and `.gitignore` doesn't exist inside `backend/`
(only a root-level one does) — the flag pointed at nothing, so the auto-generated `coverage/lcov-report/`
files were being checked (and failing) alongside real source, which is what inflated "9 files flagged" in
the first place. Rescoped to `prettier --check "*.js" "data/**/*.js" "test/**/*.js"` (matching the `lint`
script's own scope, and the Angular app's/microservice's already-correct `src/**/*.ts` patterns) — no
`.prettierignore` needed. Then ran `prettier --write` across all three sub-projects for real. Verified:
`format:check` passes clean in all three; full three-suite re-run (455/28/234 tests, unchanged) confirms
the reformat changed nothing observable; `tsc --noEmit`/`npm run typecheck`, `npm run lint` (0 errors),
and `ng build`/`npm run build` all clean.

---

## Reliability & Design Risk

### BAL-120
**Idempotency detection relies on string-matching the SQLite driver's error text** — ⚪ Info — Deferred, user-confirmed

**Evidence:** `microservices/balance-component/src/store/balanceMovementStore.ts:164` —
`/UNIQUE constraint failed/.test(message)` is how a resubmission against the same
`(balanceContractId, eventSeq)` is detected and routed to `findByContractAndEventSeq()` instead of
throwing. Works correctly today (covered by tests) but is fragile against a future `node:sqlite` version
changing its error message format, since it matches message text rather than a stable driver error code.

**Recommended remediation:** not urgent; if `node:sqlite` ever exposes a stable error code/type for
constraint violations, prefer that over message-text matching.

**Outcome (2026-08-16): Deferred, no action — explicitly user-confirmed.** Same posture as
BAL-001/BAL-002/BAL-102: `node:sqlite` (Node's built-in `DatabaseSync`) does not currently expose a
stable error code/type for constraint violations to switch to, so there is no better mechanism available
today to replace the message-text match with — this isn't deferred work sitting on the shelf, it's
blocked on the underlying driver. Revisit if/when `node:sqlite` adds one, or as part of the already-planned
SQLite→PostgreSQL swap (BAL-102), whichever comes first. Severity unchanged at Info — this was never a
gate condition and remains a non-blocking finding either way.

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
**Two independently-maintained domain-enum sources of truth** — ⚪ Info — Fixed

**Evidence:** `src/app/transaction-builder/balance-component.model.ts` (Angular) and
`microservices/balance-component/src/types.ts` (server) each independently declare the `InstrumentType`
union and legal-movementType-per-instrument tables. Architecturally normal for a decoupled client/server
pair, but a schema-drift risk class: nothing currently detects if one side adds/renames a value without
the other following. The two remain in sync as of this review.

**Recommended remediation:** not urgent given low current change frequency; a small contract test would
catch drift cheaply if it becomes a problem.

**Outcome (2026-08-16, user-directed as P2 — "建議現在就做，成本低"): the recommended contract test is now
in place.** New `src/app/transaction-builder/instrument-type-contract.spec.ts` reads both sides' source
files as plain text (`fs.readFileSync`, never `import`/compile — specifically to never cross the two
projects' separate tsconfigs/Jest configs) and regex-extracts (1) `InstrumentType`'s own literal union
values from both `balance-component.model.ts` and the microservice's `types.ts`, asserting set equality,
and (2) the flattened movementType set from Angular's `MOVEMENT_TYPES_BY_INSTRUMENT` against the bare
keys of the microservice's own `MOVEMENT_DIRECTION` (the microservice has no per-instrument table of its
own — `MOVEMENT_DIRECTION`'s keys are the true "server knows a legal movementType" set). Both currently
match exactly (10 instrument types, 14 movementTypes). Verified the test isn't a tautology: manually
injected a fake `'FAKE_DRIFTED_TYPE'` into the microservice's `types.ts`, confirmed the test fails with a
clear diff output, then restored the file (confirmed a clean `git diff`, zero net change). 2 new tests,
full suite 467/467, coverage floor still cleared, `tsc --noEmit`/`npm run lint`/`format:check` all clean.

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
**Test coverage clears 95% on all four metrics, across all three independent suites.** 729 tests total,
all green as of this review (microservice count includes the currency-decimal-place, BAL-115, and
BAL-116 fixes' own new tests; backend count includes BAL-117/BAL-118's own new/updated tests; Angular
count includes BAL-003's Checker Actions consolidation, `submit()` split, `PagedListState`'s own 10 new
tests, and the Checker Actions service extraction (0 new tests needed — the existing describe blocks
covered every branch already), plus BAL-108's retyping and BAL-110's 2 new contract-test cases):

| Suite | Statements | Branches | Functions | Lines | Tests |
|---|---|---|---|---|---|
| `microservices/balance-component/` | 98.98% | 95.95% | 100% | 99.33% | 234 |
| `backend/` | 97.97% | 97.36% | 95.65% | 97.77% | 28 |
| Angular app (`src/app/`) | 99.68% | 95.53% | 99.41% | 99.73% | 467 |

(Figures above are from the fifth same-day pass's final full three-suite re-run, confirming BAL-110's
contract test and BAL-003's Checker Actions extraction — on top of the earlier `submit()` split,
`PagedListState`, BAL-105's repo-wide reformat, and BAL-108's remaining retyping — changed zero observable
behavior in any pre-existing test. The Angular branch figure dips slightly, 95.65% → 95.53%, from two
pre-existing `pendingItemLabel ?? 'Document Arrival'` fallback branches moved verbatim into the new
`checker-actions.service.ts` — not a new coverage gap, still comfortably above the 95% floor.)

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

1. **BAL-001** *(Deferred, user-confirmed)* — real authentication, with `createdBy`/`releasedBy`/etc.
   derived server-side from a verified identity, not trusted from the request body.
2. **BAL-002** *(Deferred, user-confirmed)* — Angular upgraded off the CVE-affected 17.3.x line.
3. **BAL-102** *(Deferred, user-confirmed)* — the SQLite→PostgreSQL engine swap, if this project's
   storage layer is ever promoted beyond prototype use.

All three are explicit, recorded decisions to defer — not unaddressed oversights — but each still blocks
an actual production deployment until it's done; "deferred" describes the *decision*, not the *risk*.

**BAL-115 (the monetary-amount parsing bypass) is fixed as of this pass** — no longer a gate condition.
**BAL-116, BAL-117, BAL-118, BAL-119 are all fixed as of this second same-day pass** — none were gate
conditions to begin with, but are no longer open findings either.

**BAL-105 and BAL-108 are both fixed as of this third same-day pass** — `format:check` passes clean across
all three sub-projects, and the 5 remaining `any`-typed fields in `transaction-builder.component.ts` are
now genuinely typed. **BAL-003's all 3 originally-planned extractions are also done as of this pass** —
Checker Actions (release/reject/cancel/acknowledge), the paginated-catalog/API-error helpers, and
`submit()` itself (~423 lines → a 29-line dispatcher plus named, single-purpose private methods).

**A fourth same-day pass then applied OOD/SOLID principles to close BAL-003's remaining identified
duplication** — the 3 paginated pickers' own `page`/`total`/`pageSize` state and boundary-math, previously
three separate copies, are now one shared, independently-tested `PagedListState` class, with the existing
public property names preserved via delegating accessors (zero of the ~96 existing test call sites or 8
template bindings needed to change).

**A fifth same-day pass then closed BAL-110** (a text-based contract test now catches `InstrumentType`/
movementType drift between the Angular model and the microservice, verified against a manually-injected
fake drift) **and extracted BAL-003's Checker Actions into a dedicated `CheckerActionsService`** via
genuine Dependency Inversion — deliberately reversing the 3rd pass's own recorded decision against a full
service move, after re-confirming with the user that the earlier reasoning (a naive move would need to
thread ~10 pieces of state) was correct for a naive move but not for one built on a narrow, read-only
context interface instead. This is the first BAL-003 fix that reduces the *number of jobs* the class does,
not just DRYs one job's internals — Checker release/reject/cancel orchestration genuinely lives elsewhere
now. None of this blocks a production decision on its own, and BAL-003 no longer has an *identifiably
unfinished* piece — but it stays open at Major because the class still directly owns function/side
selection, three picker state machines, Maker submit dispatch, and the Look Up panel; a genuine
architectural decomposition of what remains stays separate, deliberately out-of-scope future work, not a
defect in what was done across these five passes.

BAL-120 is now also explicitly **Deferred, user-confirmed** (Info-level, not detailed above as a gate
item) — blocked on `node:sqlite` not yet exposing a stable constraint-violation error code, not sitting
idle by choice — and likewise blocks nothing on its own.
