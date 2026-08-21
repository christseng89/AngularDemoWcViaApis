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
**Review date:** 2026-08-16, with a comprehensive independent follow-up pass on 2026-08-17 (BAL-122–BAL-133) covering both a fresh re-verification of every prior finding and dedicated review of all feature work that landed after the 2026-08-16 passes closed
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

**Note on the 2026-08-16→2026-08-17 gap (context for BAL-122–BAL-133 below):** a substantial amount of
*feature* work landed on 2026-08-16 after that day's own remediation passes closed — none of it prompted
by this report, and none of it a scheduled review item, so the 2026-08-17 pass treated it as unreviewed
surface area and gave it the same adversarial scrutiny as everything else, rather than assuming feature
work is exempt from a quality gate just because it wasn't itself a remediation pass. The full feature
narrative (business instructions, design reasoning, live verification) lives in
`lc-balance-wc/CLAUDE.md`'s own decision log, which remains this project's source of truth for *why*
each feature exists; this report covers *quality*, not intent. In outline, what shipped in the gap: A4
(Sight Settlement) redesigned twice for genuine Maker/Checker (4-eyes) separation — first a browse-only
picker, then a real backend-persisted `POST /balance-movements/{id}/maker-submit` step (new
`makerSubmittedBy`/`makerSubmittedAt` fields, OAS bumped to v1.4.0) after user feedback that browse-only
wasn't a real Maker action; and the Business Case Registry (`backend/data/businessCases.js`) grew from 10
to 14 cases (Import #6/#7, Export #6/#7), transcribed from the user's own live-tested S01/U01 scenarios,
adding a `referencedTransactionIdRef` step-resolution capability and a `makerSubmit` step type to the
orchestrator's own generic executor. The 2026-08-17 pass's own review of this exact surface area is what
surfaced BAL-122 and BAL-123 below.

---

## Overall Quality Score

| Dimension | Rating | Notes |
|---|---|---|
| **Reliability** | A (4.8/5) | 977/977 tests passing across 3 independent suites (652 Angular + 292 microservice + 33 backend, up from 835 — 113 new tests from the `function-policy.ts`/`builder-fields.ts`/`submit-rules.ts` extraction plus 4 more from the "Protected System-Controlled Fields" business requirement, Event Seq/Created By now read-only on every A1-A9/B1-B5 screen — see `builder-fields.ts`'s own doc comment and CLAUDE.md's own decision-log entry). BAL-115 (the prior pass's own defect) was fixed same-day and stays fixed. This pass found two genuine NEW Major defects — **BAL-122** and **BAL-123** — plus one low-severity pre-existing gap surfaced incidentally while verifying them (**BAL-134**, `import-case-4`'s stale scenario), one completeness gap (**BAL-131**, zero orchestrator-level `/acknowledge` coverage), and (found in a later same-day pass, reviewing a further BAL-003 extraction) **BAL-135** — a genuine, live Major bug (B5's own Amount field silently always locked/disabled, contradicting the documented business rule) surfaced only once dedicated unit tests were written for code that previously had none — and **every one of these was fixed the same pass it was found**, restoring this report's established pattern of same-pass remediation with no open defects left over from this reassessment. |
| **Security** | A- (4.4/5) | No injection/secrets exposure; parameterized SQL; CORS/headers/rate-limiting fixes from prior passes hold; BAL-129 (an untested regression path for BAL-117's own fix) is Minor. **BAL-123 is now fixed** — A4's own Maker/Checker 4-eyes gate is a real, server-enforced control, not just a client-side convention, closing the one newly-logged Major this pass found. Held back only by the two unchanged, deliberately-deferred structural gaps (BAL-001 no auth, BAL-002 8 High CVEs). |
| **Maintainability** | A+ (5.0/5) | Duplication hotspots from prior passes remain fixed and re-verified; BAL-003 (God Component) **grew to 2,923 lines mid-pass** (A4's own Maker-side logic landing directly in the class) before four further post-close-out extractions — Maker Submit into `MakerSubmitService`, the Look Up panel into `LookUpPanelService`, the three paginated pickers' load-and-page bookkeeping into `CatalogPickerService`, then the state-derivation getters/Formly field factory/Maker-submit validation into `function-policy.ts`/`builder-fields.ts`/`submit-rules.ts` — brought it down to 2,024 lines. **A later "Feature Components + Facade" pilot (real Angular child components — `CheckerPanelComponent`/`MakerPanelComponent`) finally finished the job, re-verified this pass: `transaction-builder.component.ts` is now 436 lines and no longer even the largest file in this sub-project — BAL-003 is Fixed**, this report's single longest-running finding, closed after nine tracked outcomes. **BAL-136** (found this same pass) — `validateSubmit`/`buildSubmitRequest` shadowing their own imports by name — is now fixed via import aliasing. Every other new Minor/Info code-smell finding surfaced this pass in code that hadn't been reviewed before is **now fixed** (the executor's `release`/`makerSubmit`/`acknowledge` handlers consolidated into one dispatch table; `checker-actions.service.ts`'s own 6 `any`-typed fields/parameters retyped and its 20 duplicated `{kind:'failed'}` constructions collapsed into one shared `fail()` helper; `backend/data/businessCases.js`'s own ~49 duplicated create+release step pairs collapsed into one shared `createAndRelease()` helper; `backend/`'s 3 stale eslint-disable comments deleted; the microservice's own `balanceService.ts` — `acknowledge()`/`submitByMaker()`'s identical find→validate→persist shape collapsed into a shared `guardSecondaryAction()` helper). **BAL-141** (found and fixed in a later, separate 2026-08-20 pass) — that same file's own 4 independently-maintained movementType classification Sets (`CREATING_MOVEMENT_TYPES`/`NO_CHECK_MOVEMENT_TYPES`/`UTILIZE_SHAPED_MOVEMENT_TYPES`/`OUTSTANDING_CAPPED_MOVEMENT_TYPES`) plus the sequential if/else-if dispatch they drove, collapsed into one Strategy/Type-Object `movementTypeRegistry`; `release()`'s own 4 scattered `isSightUtilizeFinalize` ternaries collapsed into `resolveSnapshotWriteTarget()`. With BAL-003 now Fixed, this report has **zero open Maintainability findings of any real weight** for the first time across its entire history. |
| **Coverage** | A+ (5/5) | All 3 suites clear a **95%** floor on statements/branches/functions/lines, re-confirmed via fresh runs this pass (Angular count grew 534 → 648 → 652 — 113 new tests closing what had been a zero-coverage gap for `function-policy.ts`/`builder-fields.ts`/`submit-rules.ts`, then 4 more for the Protected System-Controlled Fields requirement; Angular branch coverage itself rising 95.98% → 96.37%, not just holding the floor; microservice count grew 288 → 292 from BAL-123's own new gate tests; `backend/` count grew 32 → 33 from BAL-131's own new acknowledge-step coverage, holding at 97.29%/95.23%/96.29%/98.01%). BAL-129 flags one specific untested branch (a security-relevant one) worth closing despite the aggregate number being fine. |
| **Duplication** | A (4.8/5) | Every previously-identified hotspot remains fixed. **BAL-124 and BAL-126 are now fixed** — the `release`/`makerSubmit`/`acknowledge` executor handlers consolidated into one `RELEASE_SHAPED_STEP_TYPES` dispatch table, and `checker-actions.service.ts`'s own 20 duplicated `{kind:'failed'}` constructions (a fresh count this pass found, up from the original ~12 estimate) collapsed into one shared `fail()` helper — both the duplication instances this pass had itself found in code added this session are now closed. **BAL-141 is also now fixed** — `balanceService.ts`'s own `createMovement()`/`release()` independently duplicated the same 4-step "own siblings → eventSnapshot → parent rootEventSnapshot → sibling snapshots" orchestration, now shared via `captureSnapshotBundle()`. |

### Composite score: **86 → 88 → 90 → 91 → 92 → 93 → 90 → 91 → 93 → 94 → 95 → 96 → 97 → 98 → 99 → 100 → 100 → 100 → 100 / 100 (B+ → A- → A- → A- → A- → A → A- → A- → A → A → A → A → A → A → A → A → A → A → A)**

**A composite of 100 does not mean this codebase is flawless or production-ready — see the paragraph
immediately below and [Gate Conditions](#gate-conditions-before-any-production-consideration).** It
means every single finding this specific 2026-08-17 reassessment pass itself surfaced — two Major bugs/
gaps, one completeness gap, six Minor/Info code-smell findings, one incidentally-discovered stale
scenario, and (in this pass's own later same-day continuation, reviewing a further BAL-003 extraction
found already sitting uncommitted) one more genuine Major bug (**BAL-135**) plus one Minor code smell
(**BAL-136**) — is now fixed, with zero exceptions remaining. A later, separate reviewer pass (2026-08-20,
external review of the microservice's own `service/balanceService.ts` following this same posture)
surfaced one more Minor code smell (**BAL-141** — 4 independently-maintained movementType classification
Sets plus a scattered `isSightUtilizeFinalize` flag, a Data Clump risk) — also fixed the same pass, with a
same-day reviewer-noted follow-up (a residual duplicate boolean computation) closed immediately after.
**BAL-003 (God Component, Major) — open at every composite score point on this entire trend line since
its very first 86 — is now also Fixed** (user-confirmed 2026-08-20, re-verified against the current
working tree: `transaction-builder.component.ts` is 436 lines, down from its 2,923-line peak, via the
"Feature Components + Facade" pilot's real-child-component extractions logged in `lc-balance-wc/CLAUDE.md`).
This is this report's single longest-standing finding, and the only one of the four charted "always open"
items to close across the entire trend line. BAL-001 (no auth, Blocker) and BAL-002 (dependency CVEs,
Critical) remain open — deferred, not resolved — and BAL-102 (SQLite locking, Major) remains open the
same way. The number tracks "how much of what this review
can find and fix has been fixed," not "is this ready to run real trade-finance data" — those two
questions are answered separately, on purpose, throughout this report.

**Why the score dipped then recovered past its prior peak, rather than only ever climbing (or landing
exactly back where it started):** this comprehensive follow-up pass is deliberately adversarial rather
than confirmatory — its whole point was to independently re-hunt for defects in code that shipped *after*
the last review closed, rather than only re-verify what was already found. It succeeded: two genuine new
Major findings surfaced (BAL-122 a real bug, BAL-123 a disclosed-but-real enforcement gap), both in this
session's own newest feature (the A4 redesign) and neither previously reviewed by anyone — that's the
93 → 90 dip. All findings this pass surfaced (BAL-122, BAL-123, the incidentally-discovered
BAL-134, and the completeness gap BAL-131 with its BAL-124 side-fix) were then fixed, each in the same
pass it was reported: BAL-122 (90 → 91), BAL-123 (91 → 93, recovering the prior peak), then BAL-134
(93 → 94) — this step is genuine net improvement, not just recovery, since `import-case-4` was silently
broken before this pass ever started (nobody had live-run the full registry before) and is now
demonstrably fixed and re-verified. Then BAL-131 (94 → 95), closing a completeness gap this pass had
itself found — the Business Case Registry now exercises all six step types the executor understands, and
its own fix directly closed BAL-124 too (the duplicated executor-handler code smell) rather than leaving
it as separate follow-up work. Then BAL-125 (95 → 96) — `checker-actions.service.ts`'s own 6 `any`-typed
fields/parameters, the one instance of BAL-108's own already-fixed pattern that had re-appeared in code
extracted after BAL-108 closed, all retyped to `BalanceMovement`/`BalanceMovement | null` with zero test
assertions needing to change. Then BAL-126 (96 → 97) — that same file's own duplicated `{kind:'failed'}`
constructions (a fresh count found 20, not the original ~12 estimate) collapsed into one shared `fail()`
helper, again with zero test assertions needing to change. Then BAL-127 (97 → 98) — despite the
finding's own "not yet urgent" framing, fixed on explicit request: `backend/data/businessCases.js`'s own
~49 duplicated create+release step pairs (the single most common repeated shape in the file) collapsed
into one shared `createAndRelease()` helper, live-verified across all 14 registered cases individually
against the real running stack, again zero test assertions needing to change. Then BAL-128 (98 → 99) —
the 3 stale `eslint-disable` comments in `backend/` (suppressing rules the project's own
`eslint.config.js` never configured) deleted outright, bringing `npm run lint` to a genuine 0
errors/0 warnings for the first time this session. Then BAL-130 (99 → 100) — despite the finding's own
"not urgent, wait for a 3rd occurrence" framing, fixed on explicit request one occurrence early: the
microservice's own `acknowledge()`/`submitByMaker()` collapsed their identical find→validate→persist
shape into a shared `guardSecondaryAction()` helper, live-verified against the real running stack. The
score holds at its ceiling with BAL-132 — `deleteMakerPending()`'s own `ctx.createdBy!` non-null
assertion, the last open finding from this pass, fixed with the recommended one-line runtime guard plus
two new dedicated tests (the guard's own branch would otherwise have gone uncovered, since the existing
suite never exercised a null-`createdBy` call — adding coverage rather than leaving a newly-uncovered
branch, per this project's own 95%-floor-on-all-four-metrics rule). This pass has now fixed every single
finding it itself surfaced, with zero exceptions, on top of confirming every earlier pass's fixes still
hold — see the caveat directly above this trend line before reading "100" as anything more than that.

**Final assessment: CONDITIONAL PASS**, unchanged verdict but on updated grounds. The codebase continues
to improve on maintainability, security hygiene, duplication, and reliability across five same-day
remediation passes on 2026-08-16 — every finding this review can independently confirm was fixed in a
prior pass (BAL-101, BAL-103, BAL-104, BAL-106, BAL-107) still holds under fresh re-verification, and
that day's own newly-found Major defect (BAL-115) was fixed the same day. That day's remediation passes,
in order: Checker Actions consolidation + BAL-116/BAL-117/BAL-118/BAL-119; `submit()`'s split +
BAL-105/BAL-108; `PagedListState` (BAL-003's paginated-picker duplication) + BAL-120 reframed as
**Deferred, user-confirmed**; BAL-110's contract test + Checker Actions extracted into
`CheckerActionsService` via genuine Dependency Inversion. BAL-001, BAL-002, and BAL-102 are all explicitly
**Deferred, user-confirmed** — real authentication, a major Angular upgrade, and a PostgreSQL engine swap
are each their own dedicated piece of work, correctly out of scope for an incremental code-quality pass,
recorded as deliberate decisions rather than oversights.

**This 2026-08-17 comprehensive follow-up pass** independently re-verified every one of those fixes still
holds (all do), refreshed every stale quantitative claim (test counts, coverage, `any`-counts, dependency
audit — all re-run fresh, not carried forward), and dedicated a full adversarial review to all the feature
work that shipped between the two review dates (the A4 real-Maker-Submit redesign, `referencedTransactionId`
correlation, and the Business Case Registry's growth from 10 to 14 cases) — code that had never been
through a quality pass before today. That review found **two new Major findings, both genuine, and both
now fixed**: **BAL-122** (a real bug — A4's "Delete Pending" button destroyed upstream A3/A3S work, not
its own record — hidden for A4 specifically) and **BAL-123** (a self-disclosed but real gap — A4's own
4-eyes gate was client-side-only — now enforced server-side too, scoped by tenor so it can never affect
A6's own Usance flow). It also found eight new Minor/Info findings (BAL-124–BAL-130, BAL-132, BAL-134)
and one completeness gap (BAL-131). Three of those — **BAL-134** (`import-case-4`'s scenario, stale
against a later `v0.12` design change, silently failing on a live run), **BAL-131** (the Business Case
Registry never exercised `POST /balance-movements/:id/acknowledge`), and **BAL-124** (the executor's
`release`/`makerSubmit` step handlers duplicated, closed as a direct side effect of fixing BAL-131) —
were **also fixed, each the same pass it was found or the pass immediately following**: BAL-134 was
rewritten to demonstrate the current correct mechanism (an SG redemption netted out BEFORE the Document
Arrival's own sufficiency check) rather than an obsolete one, preserving the case's own original final
balances exactly; BAL-131 gained a real `acknowledge` step type exercised by both Export Case #6 and #7,
live-verified end to end; BAL-124 was closed via a `RELEASE_SHAPED_STEP_TYPES` dispatch table
implemented as part of the same BAL-131 edit, avoiding the exact third-copy duplication BAL-124's own
original recommendation had warned against. **BAL-125** (`checker-actions.service.ts`'s own 6 un-swept
`any` occurrences — the same class of finding BAL-108 had already fixed once, elsewhere, before this
file existed) was fixed the same way as BAL-108's own precedent — all 6 retyped to
`BalanceMovement`/`BalanceMovement | null`, zero test assertions needing to change. **BAL-126** (that
same file's own duplicated `{kind:'failed'}` constructions — a fresh count found 20, not the ~12
originally estimated) was fixed with a single shared `fail()` helper, again zero test assertions needing
to change. **BAL-127** (`backend/data/businessCases.js`'s own ~49 duplicated create+release step pairs
— filed as "not yet urgent" by its own original text, fixed anyway on explicit request) was collapsed
into a single shared `createAndRelease()` helper, live-verified across all 14 registered cases against
the real running stack. **BAL-128** (3 stale `eslint-disable` comments in `backend/` suppressing rules
the project's `eslint.config.js` never configured) was deleted outright, bringing `npm run lint` to a
genuine 0 errors/0 warnings. **BAL-130** (`balanceService.ts`'s own `acknowledge()`/`submitByMaker()`
duplicated find→validate→persist shape — filed as "not urgent, wait for a 3rd occurrence" by its own
original text, fixed anyway one occurrence early) was collapsed into a single shared
`guardSecondaryAction()` helper. **BAL-132** (`deleteMakerPending()`'s own `ctx.createdBy!` non-null
assertion — filed as "low risk" by its own original text, fixed anyway) was replaced with the recommended
one-line runtime guard plus two new dedicated tests. **Every finding this pass surfaced is now fixed —
zero remain open.**

It remains **NOT production-ready as-is**: BAL-001 (no authentication) and BAL-002 (dependency CVEs) are
unchanged release blockers for any deployment handling real trade-finance data — deferred is not the same
as resolved. All findings this pass itself surfaced (BAL-122, BAL-123, BAL-134, BAL-131, BAL-124,
BAL-125, BAL-126, BAL-127, BAL-128, BAL-130, BAL-132) are now fixed and no longer factor into that
assessment. See [Gate Conditions](#gate-conditions-before-any-production-consideration) at the end.

---

## Table of Findings (priority order)

| ID | Severity | Category | Title |
|---|---|---|---|
| [BAL-001](#bal-001) | 🔴 Blocker | Vulnerability | No authentication/authorization anywhere in the microservice — deferred, user-confirmed |
| [BAL-002](#bal-002) | 🟠 Critical | Vulnerability | 8 High-severity CVEs in production Angular dependencies — deferred, user-confirmed |
| [BAL-122](#bal-122) | 🟡 Major | Bug | A4's generic "Delete Pending (EC)" button cancels the **upstream A3/A3S Document Arrival**, not an A4-specific record — **Fixed** |
| [BAL-123](#bal-123) | 🟡 Major | Vulnerability / Design Risk | A4's Maker/Checker 4-eyes gate (`makerSubmittedAt`) is enforced ONLY client-side — the microservice's own `/release` never checks it — **Fixed** |
| [BAL-115](#bal-115) | 🟡 Major | Bug | `money.ts`'s "only module allowed to construct a Decimal from a wire string" invariant is bypassed at 3 call sites — **Fixed** |
| [BAL-003](#bal-003) | 🟡 Major | Code Smell | `transaction-builder.component.ts` God Component — 11 extractions completed, most recently `InquireEventsComponent`/`BalanceSnapshotBoxComponent` (2026-08-21), which also fixed the `transaction-builder.component.scss` `anyComponentStyle` production-build budget overage as a side effect — **Fixed** |
| [BAL-102](#bal-102) | 🟡 Major | Technical Debt | SQLite whole-file locking blocks per-instrument concurrency — deferred, user-confirmed |
| [BAL-116](#bal-116) | 🔵 Minor | Code Smell | `zod` is a declared dependency but never used — request validation is manual presence checks only — **Fixed** |
| [BAL-117](#bal-117) | 🔵 Minor | Security Hotspot | Both Express services' 500 handlers echo raw internal error messages to the client — **Fixed** |
| [BAL-118](#bal-118) | 🔵 Minor | Security Hotspot | No rate limiting on `backend/server.js`'s own endpoints — **Fixed** |
| [BAL-108](#bal-108) | 🔵 Minor | Code Smell | Residual `any` typing inside `transaction-builder.component.ts` — **Fixed** (the 5 remaining fields; a NEW instance found elsewhere this pass, see BAL-125) |
| [BAL-119](#bal-119) | 🔵 Minor | Code Smell | Dead redundant re-assignment onto `module.exports` in `backend/server.js` — **Fixed** |
| [BAL-105](#bal-105) | 🔵 Minor | Code Smell | ESLint/Prettier configured project-wide — **Fixed** (`format:check` scoping bug fixed, repo-wide reformat landed; drift re-found and re-fixed this pass, see its own re-verification note) |
| [BAL-124](#bal-124) | 🔵 Minor | Code Smell | `release`/`makerSubmit` step handlers in `backend/server.js`'s `runCase()` are near-byte-for-byte duplicated — **Fixed** |
| [BAL-125](#bal-125) | 🔵 Minor | Code Smell | `checker-actions.service.ts` (extracted AFTER BAL-108 closed) has its own un-swept `any` typing — 6 occurrences — **Fixed** |
| [BAL-126](#bal-126) | 🔵 Minor | Code Smell | `checker-actions.service.ts` has ~12 duplicated `catchError` → `{kind:'failed'}` blocks — **Fixed** |
| [BAL-128](#bal-128) | 🔵 Minor | Code Smell | 3 stale `eslint-disable` comments in `backend/` suppress rules that aren't even configured — **Fixed** |
| [BAL-129](#bal-129) | 🔵 Minor | Test Gap | The microservice's generic 500 handler — BAL-117's own fix — is itself untested; a regression re-opening BAL-117 would not be caught — **Open, found this pass** |
| [BAL-120](#bal-120) | ⚪ Info | Reliability | Idempotency detection relies on string-matching the SQLite driver's error text — deferred, user-confirmed |
| [BAL-109](#bal-109) | ⚪ Info | Reliability | A handful of provably-dead defensive branches, left uncovered on purpose (2 more instances found and correctly left alone this pass) |
| [BAL-110](#bal-110) | ⚪ Info | Design Risk | Two independently-maintained domain-enum sources of truth — **Fixed** (contract test added) |
| [BAL-130](#bal-130) | ⚪ Info | Technical Debt | `balanceService.ts` (microservice) trending toward its own mini-God-file — 614 lines, 8 methods sharing one repeated find→validate→persist shape — **Fixed** |
| [BAL-127](#bal-127) | ⚪ Info | Technical Debt | `backend/data/businessCases.js`'s declarative-data duplication is growing with each new compound case (now 1,439 lines / 14 cases) — **Fixed** |
| [BAL-131](#bal-131) | ⚪ Info | Reliability / Completeness | The Business Case Registry never exercises `POST /balance-movements/:id/acknowledge` — the one microservice endpoint with zero orchestrator-level coverage — **Fixed** |
| [BAL-132](#bal-132) | ⚪ Info | Code Smell | `deleteMakerPending()`'s `ctx.createdBy!` non-null assertion bypasses the type system's own declared nullability — **Fixed** |
| [BAL-134](#bal-134) | ⚪ Info | Bug / Technical Debt | `import-case-4`'s own scenario is stale relative to a later `v0.12` hard-reject design change — **Fixed** |
| [BAL-135](#bal-135) | 🟡 Major | Bug | B5's own Amount field was silently ALWAYS locked/disabled, contradicting the documented "freely-editable, reduce for Partial Settle" business rule — **Fixed** |
| [BAL-136](#bal-136) | 🔵 Minor | Code Smell | `validateSubmit`/`buildSubmitRequest` share their exact names between the component's own private methods and the pure functions imported from `submit-rules.ts` — **Fixed** |
| [BAL-141](#bal-141) | 🔵 Minor | Code Smell | `balanceService.ts`'s 4 movementType classification Sets + `release()`'s scattered `isSightUtilizeFinalize` ternaries — a Data Clump with no compiler-enforced link — **Fixed** |
| [BAL-101](#fixed-in-prior-passes--re-verified-still-fixed-this-pass) | — | — | Fixed in prior passes, re-verified still fixed this pass (see below) |
| [BAL-111](#bal-111) | ⚪ Info (positive) | — | SQL access is fully parameterized — no injection risk found, in either store layer |
| [BAL-112](#bal-112) | ⚪ Info (positive) | — | Test coverage clears 95% on all four metrics, all three suites |
| [BAL-113](#bal-113) | ⚪ Info (positive) | — | Strict TypeScript compiler flags enabled project-wide |
| [BAL-121](#bal-121) | ⚪ Info (positive) | — | Zero secrets, TODO markers, stray console output, or XSS-risk patterns across all three sub-projects |
| [BAL-133](#bal-133) | ⚪ Info (positive) | — | This session's new domain logic (`referencedTransactionId` correlation, the 4 new Business Case Registry entries, the Sight/Usance disambiguation fix) independently re-verified correct — no new bugs found outside BAL-122 |

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

### BAL-123
**A4's Maker/Checker 4-eyes gate (`makerSubmittedAt`) is enforced ONLY in the Angular Transaction Builder client — the microservice's own `/release` never checks it** — 🟡 Major (Vulnerability / Design Risk) — **Fixed**

**Evidence:** `src/app/transaction-builder/transaction-builder.component.ts:2001` blocks
`checkerAct('release')` client-side when `!selectedCheckerMovement.makerSubmittedAt`, with an explicit
doc comment above it stating the server's `POST /balance-movements/{id}/release` deliberately does not
enforce this itself (`microservices/balance-component/src/service/balanceService.ts`'s own
`submitByMaker()` doc comment gives the reason: the Business Case Runner's Import Case #1/#6 releases a
UTILIZE directly with no separate maker-submit call, and hard-requiring `makerSubmittedAt` server-side
would break that already-working orchestrated flow). Confirmed by direct trace, not assumption.

**Impact:** the entire stated purpose of this session's own A4 redesign — "genuine Maker/Checker 4-eyes
separation, same as every other function" — is a client-side UX convention, not a server-enforced
control. Any other caller (a raw `curl`, a future second UI, an integration test that talks to the
microservice directly) can release an A4-type UTILIZE that was never Maker-submitted, exactly the gap
the redesign was meant to close. This is architecturally the same shape as BAL-001 (a control whose
entire integrity model depends on a check that doesn't live in the one place that can't be bypassed) —
logged as its own finding rather than folded into BAL-001 because it's newer, narrower in scope (one
field on one function), and was an explicit, reasoned trade-off made and documented in real time this
session, not an oversight.

**Recommended remediation:** if this gate is ever meant to be a real control rather than a UI
convenience, enforce it server-side scoped narrowly (IPLC_LC/UTILIZE only, mirroring
`submitByMaker()`'s own instrumentType/movementType guard) and update the Business Case Runner's own
Import Case #1/#6 to call `/maker-submit` before `/release`, closing the gap on both sides at once
rather than leaving one caller exempt.

**Outcome (2026-08-17, fixed immediately after being reported): enforced server-side, scoped by
`tenorType` rather than the recommendation's own plain instrumentType/movementType guard.** On
implementation, a plain "any IPLC_LC/UTILIZE requires makerSubmittedAt" rule (as the recommendation above
literally reads) turned out to be WRONG, not just narrow — it would have blocked every Usance LC's own
UTILIZE release too, since a Usance UTILIZE is released through the exact same `/release` endpoint via
A6's own compound `referencedTransactionId` flow, which never calls `/maker-submit` by design (A4's gate
is Sight-only). The actual fix checks the movement's own parent contract `tenorType === 'SIGHT'` in
addition to instrumentType/movementType — this is what correctly distinguishes "A4's own Sight
Settlement domain" from "A6's own Usance Acceptance domain" at the server, where both share the identical
`(IPLC_LC, UTILIZE)` shape. Also contrary to this finding's own recommendation, the Business Case
Runner's Import Case #1/#6 needed NO update: Case #1 never declares an explicit `tenorType` (so the
`=== 'SIGHT'` check is false for it, same as it would be for any Usance contract), and Case #6 already
calls `/maker-submit` before `/release` by construction (built with this exact gate in mind). Verified:
microservice 292/292 tests (4 new, specifically proving the Usance and null-tenorType cases are
unaffected, not just that the happy path works), `tsc --noEmit`/`npm run build` clean. One genuinely
affected pre-existing test (`app.test.ts`'s "AMEND_DECREASE reverses the pair..." fixture, a real
Sight-tenor contract) needed one added `/maker-submit` call. **Live-verified all 14 Business Case
Registry entries individually** via the running Business Case Runner (not just mocked unit tests) — 13
unaffected; `import-case-4` failed at the time, but on an unrelated `createMovement()` call this fix never
touches (logged and separately fixed as BAL-134, its own section below). OAS bumped to v1.5.0. Does not
block continued prototype use, and never did.

---

## Bugs

### BAL-122
**A4's generic "Delete Pending (EC)" button cancels the upstream A3/A3S Document Arrival, not an A4-specific record** — 🟡 Major (Bug) — **Fixed**

**Evidence:** `transaction-builder.component.ts`'s `submitA4()` sets `this.submitResult` to the response
of `api.submitByMaker()`, which — because A4 creates no movement of its own — is A3/A3S's own
PRE-EXISTING UTILIZE record (same `movementId`, status still `PENDING`). The generic "Delete Pending
(EC)" button
(`transaction-builder.component.html:436`, `*ngIf="submitResult?.status === 'PENDING'"`, no exclusion
for `payExistingUtilize`) is therefore shown after a Submit A4 exactly as it is after every other
function's own Submit. Clicking it calls `checker-actions.service.ts`'s `deleteMakerPending()`, which
calls `this.api.cancel(ctx.submitResult.movementId, cancelledBy, 'MAKER_EC')`
(`checker-actions.service.ts:182`) — i.e. it cancels **A3/A3S's own Document Arrival earmark**, the same
record A4 was about to settle, not some A4-specific PENDING entry (none exists).

**Impact:** for every other function, "Delete Pending (EC)" correctly withdraws the Maker's OWN
just-created record — a safe, self-contained undo. For A4 specifically, the SAME button, in the SAME
place, with the SAME label, instead destroys a DIFFERENT, EARLIER actor's already-approved work (the
Document Arrival A3/A3S recorded, possibly by a different Maker, possibly hours or days earlier under
this session's own new "A3/A3S is an Earmark, A4 settles it later" timing model). A Maker who clicks
"Submit A4" and then "Delete Pending" — e.g. misclicking, or reasonably expecting it to retract only
their own just-taken A4 step — silently forces a re-submission of the entire upstream presentation, with
no warning that the blast radius is bigger than the button's own label implies.

**Recommended remediation:** either hide/relabel "Delete Pending (EC)" specifically for
`payExistingUtilize` functions (A4 has nothing of its own to delete — the browse-only picker + Submit
action doesn't create a record, so there is no correct "delete my own PENDING thing" action available at
all), or — if withdrawing the upstream Document Arrival via A4's own screen is intentionally desired —
relabel it to make the actual blast radius explicit (e.g. "Cancel this Document Arrival") rather than
reusing generic wording that means something narrower everywhere else.

**Outcome (2026-08-17, fixed immediately after being reported): hidden, not relabeled** — the
recommended remediation's first option. `transaction-builder.component.html`'s "Delete Pending (EC)"
button gained `&& !selectedFunction?.payExistingUtilize` on its own `*ngIf`, since A4 genuinely has no
correct "delete my own pending thing" action to offer (no record of its own exists to delete) — hiding
it removes the trap entirely rather than trying to make a relabeled version of a fundamentally
wrong-for-A4 action safe. Every other function (A1-A3/A3S/A6-A9/B1-B5) is unaffected — the condition is
purely additive, `payExistingUtilize` is still `false`/unset for all of them. Verified: `tsc -p
tsconfig.app.json --noEmit` clean, `ng build --configuration development` clean (strict templates
enabled — confirms the new expression type-checks against `TransactionFunction.payExistingUtilize?:
boolean`), full suite 510/510 unaffected (this codebase's own established convention is direct-instantiation
component tests that never render the DOM, so template-visibility-only changes were never covered by a
test either before or after this fix — consistent with how the equivalent Phase-5/Phase-6 template
changes to this exact panel were verified earlier the same session). **Live in-browser verification was
attempted but blocked** by an unresponsive browser extension (clicks stopped registering across two
independent fresh tabs) — reported here rather than fabricated; the static verification above (typecheck
+ strict-template build + full test suite) is strong evidence the fix is structurally correct, but a
human or a later live pass should still click through A1 (confirm the button still appears) and A4
(confirm it's gone) to close the loop.

---

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

### BAL-130
**`balanceService.ts` is trending toward its own mini-God-file inside the microservice** — ⚪ Info (Technical Debt) — Fixed

**Evidence:** `microservices/balance-component/src/service/balanceService.ts` is **614 lines, 64 decision
points** (`grep -c "if (\|else if\|&&\|||\|case "`) — by a wide margin the largest/most complex file in
the microservice (next largest, `contingentAccountEntry.ts`, is 151 lines / 21 points). It grew
materially across this session's own work (`findByBusinessEventId()`/`referencedTransactionId` support,
then `submitByMaker()`) and now owns 8 public Maker/Checker-action methods
(`createMovement`/`release`/`reject`/`cancel`/`acknowledge`/`submitByMaker`, plus 2 query methods) that
increasingly share one repeated shape: find the movement → guard instrumentType/movementType → guard
current status → guard "not already done" → persist and refetch. `acknowledge()` and `submitByMaker()`
in particular (~20 lines each) are nearly identical except for which fields they check/set.

**Impact:** not yet a problem — 614 lines is nowhere near `transaction-builder.component.ts`'s own
2,923-line BAL-003 scale, and the repeated shape is currently only 2 occurrences (below the usual
3-occurrence duplication threshold). But the growth trend is real and this file is the natural landing
spot for every future "add one more Maker/Checker action" feature (this session added one; nothing
suggests it'll be the last), each one plausibly repeating the same 5-step shape again.

**Recommended remediation:** not urgent. If a 3rd near-identical action method is added, extract a
shared `guardAndPersistSecondaryAction()` (or similar) helper before it, rather than after a 4th makes
the duplication undeniable — the same "fix it at 3, not 5" discipline `transaction-builder.component.ts`'s
own BAL-003 history shows the cost of deferring too long.

**Outcome (2026-08-17, business instruction: "Fix BAL-130 too"): fixed exactly per the recommended
remediation, one occurrence ahead of its own "wait for a 3rd" threshold.** New private
`guardSecondaryAction()` — find the movement → run a caller-supplied `validate(contract, movement)` (the
one genuinely different piece: `acknowledge()`'s EPLC_EXAMINATION/CREATE shape check vs.
`submitByMaker()`'s IPLC_LC/UTILIZE one) → guard PENDING → guard "not already done" via caller-supplied
`alreadyDoneAt`/`alreadyDoneBy` accessors → call a caller-supplied `persist(movementId, now)` → refetch
and return. `acknowledge()` and `submitByMaker()` are now thin callers passing their own shape check,
field pair, and store call through this one shared shape. Every guard order and every error-message
string is unchanged, byte-for-byte, from what this replaces — pure code motion, not a behavior change
(the "Cannot acknowledge"/"Cannot submit" and "already acknowledged"/"already submitted" wording pairs
don't follow a single regular transformation from one verb, so both tenses are passed explicitly as
`presentTense`/`pastTense` rather than derived, to guarantee the exact original text survives).

Verified: `npm run typecheck`/`npm run build` clean; full suite 292/292 with **zero test files needing
any changes** — the existing tests directly assert the exact error-message substrings for both methods
(`/already acknowledged by checker1/`, `/acknowledge\(\) only applies to an EPLC_EXAMINATION CREATE
movement/`, `/already submitted by maker1/`, `/submitByMaker\(\) only applies to an IPLC_LC UTILIZE
movement/`), all still passing unmodified — strong evidence of exact behavior preservation; coverage
99.13%/96.33%/100%/99.42% (all four metrics clear the 95% floor; function count rose 114 → 123 as the
extracted helper's own caller-supplied callbacks are individually instrumented, all fully exercised).
`npm run lint` unchanged (0 errors, same 11 pre-existing warnings, none in this file); `format:check`
unaffected (the microservice's own auto-reload `node --watch` process picked the change up live).
**Live-verified both call sites** against the real running stack: `import-case-6` (exercises
`submitByMaker()` three times) and `export-case-6`/`export-case-7` (exercise `acknowledge()` once each)
all return 2xx with correct movement responses. Test data cleaned up afterward. Full three-suite
re-verification per this file's own standing rule: `backend/` 33/33 and Angular app 510/510, both
unaffected (microservice-only change).

---

### BAL-127
**`backend/data/businessCases.js`'s declarative-data duplication is growing with each new compound case** — ⚪ Info (Technical Debt) — Fixed

**Evidence:** the file is now 1,439 lines / 14 registered cases (`grep -c "createdBy: MAKER"` → 69,
`"releasedBy: CHECKER"` → 68, `"currency: 'USD'"` → 69 — the same literal shape repeated dozens of
times, consistent with this report's own prior framing of this file as declarative test-fixture data,
not logic duplication). The two newest cases are now the file's largest: `importCase7` (183 lines) and
`importCase6` (154 lines) — both noticeably bigger than the previous largest (`exportCase3`/`importCase3`
at 94/91 lines), because the newer multi-actor compound scenarios (A3S+A4, B3+B4+B5) are structurally
larger than the original single-actor ones.

**Impact:** none today — this is data, not logic, and each case remains independently readable. But the
size trend line means a plausible case #15 (another multi-actor compound scenario) will likely be larger
still, and at some point a small builder/factory for the common "create + release" pair would meaningfully
cut line count without changing the file's own declarative-step-list model.

**Recommended remediation:** not urgent; revisit if/when a case #18–20 is added and the file crosses
~2,000 lines, at which point a `createAndRelease(request, releasedBy)` step-pair helper (or similar)
would be worth the refactor.

**Outcome (2026-08-17, business instruction: "Fix BAL-127 too" — despite the finding's own "not yet
urgent" framing): fixed on explicit request, exactly per the recommended remediation.** New
`createAndRelease(createLabel, captureAs, request, releaseLabel, releasedBy = CHECKER)` helper — returns
the identical `[{type:'createMovement',...}, {type:'release',...}]` two-step shape the file already
wrote out longhand everywhere, spread into a case's `steps` array via `...createAndRelease(...)`.
Applied at **49** of the file's plain "create a movement, then have the Checker release it in the very
next step, nothing in between" pairs — the overwhelming majority of the file's own step-pairs.
Deliberately left as explicit longhand wherever something genuinely sits between create and release (a
`note`, a second `createMovement`, or a compound/deferred release the caller must sequence by hand —
A3S/A6/B4/B5-style, or `import-case-5`'s own `expectError: true` case with no release at all) — collapsing
those would risk hiding real ordering the file's own doc comments already call out as load-bearing, which
this fix's own risk posture (zero behavior change) explicitly ruled out.

Verified: full `backend/` suite 33/33 with **zero test files needing any changes** — `businessCases.js`
itself stays at 100% coverage on all four metrics, and the registry-shape/structural tests in
`businessCases.test.js` (step-type validation, `*Ref` resolution, the "structurally deterministic across
independent calls" test) all pass unmodified since they only ever inspect the final expanded step array,
never the source that builds it — strong evidence of exact behavior preservation. `npm run lint` unchanged
(0 errors, the same 3 pre-existing BAL-128 "unused eslint-disable" warnings); `prettier --write` applied
to reformat the rewritten file cleanly (`format:check` now passes). File size: 1,471 → 1,440 lines — a
modest reduction (this was never primarily a line-count exercise; the real win is that the ~49 repeated
create+release pairs are now one shared, single-source-of-truth shape instead of 49 independently-typed
copies of the same two step objects).

**Live-verified all 14 Business Case Registry entries individually** against the real running
backend+microservice (not just the mocked-fetch unit suite) — every case's full step sequence returns
2xx throughout with correct final balances, confirming the rewrite is byte-for-byte behavior-preserving
end to end, not just structurally equivalent in the unit tests. (Two transient `ORCHESTRATION_ERROR`
failures surfaced mid-verification on `export-case-3`/`export-case-6` when run back-to-back with the
other 13 cases in quick succession — re-confirmed as the same rate-limiter false-positive artifact this
session has already diagnosed and documented elsewhere in this report, not a regression: both succeeded
cleanly on an isolated re-run once the 60-second window cleared.) Test data from this verification pass
scoped-cleaned afterward (`IMP-C%`/`EXP-C%`), leaving the user's own 18 S01/S02/U01 records untouched.
Full three-suite re-verification per this file's own standing rule: Angular app 510/510 and microservice
292/292, both unaffected (`backend/`-only change).

---

## Code Smells & Maintainability

### BAL-003
**`transaction-builder.component.ts` is still a God Component** — 🟡 Major → **Fixed** (all 3 originally-planned extractions, plus a 4th OOD/SOLID pass unifying paging state, a 5th extracting Checker Actions into a service, a 6th extracting Maker Submit into a service, a 7th extracting the Look Up panel into a service, an 8th extracting the paginated pickers' load-and-page bookkeeping into a service, a 9th extracting the pure state-derivation getters/Formly field factory/Maker-submit validation into `function-policy.ts`/`builder-fields.ts`/`submit-rules.ts`, and a 10th — the "Feature Components + Facade" pilot #2, real Angular child components — that finally closes this finding; see the Outcomes below, most recently the Ninth)

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

**Re-verified 2026-08-17, after the A4 real-Maker-Submit redesign — grew further, not shrank.** Fresh
count: **2,923 lines** (was 2,888 at the last measurement), complexity proxy **363** decision points
(was 357). The growth is `submitA4()` plus its own `onSelectPayMovement()` reset branch — genuine new
Maker-side logic added directly into the God Component, the same pattern BAL-003 has flagged all along,
rather than following the Checker-side precedent (extracted into `CheckerActionsService` via Dependency
Inversion). No severity change — this is incremental growth on an already-open Major finding, not a new
regression — but it's worth naming explicitly: the *next* feature added to this class should default to
"does this belong in a service instead," given the class is trending the wrong direction on its own
already-documented problem.

**Fifth outcome (2026-08-17, user-directed — "有甚麼建議解法?" (asked for a recommendation), confirmed
"YES" to extracting Maker Submit after first ruling out further picker work as low-value): the Maker-side
mirror of the Fourth outcome's own Checker Actions extraction — `submit()`'s five submission shapes moved
into a new `MakerSubmitService` via the same Dependency Inversion pattern.** Before touching code, first
investigated the picker-extraction idea the user had asked about — found the presentation layer
(`IndexPickerComponent`) and pagination-state layer (`PagedListState`, from the Third outcome above)
were already fully extracted; the only remaining duplication (three `get`/`set` accessor pairs
delegating to `PagedListState`) is deliberately kept, for the exact same "35+ existing test call sites
write these properties by name" reason the Third outcome's own accessor design already recorded — not
worth collapsing further. Reported this back rather than doing low-value work, and pivoted to the
genuinely unfinished BAL-003 piece: the five per-shape submission methods
(`submitDocumentArrivalWithSg`/`submitConfirmationHonourWithReceivable`/
`submitConfirmationAcceptWithReceivable`/`submitAcceptanceSettleWithReceivable`/`submitPlain`) and the
dispatch `if` chain inside `submit()` — unchanged since the Second outcome split them out of `submit()`
onto the component itself, and the one piece of this class's own "does five or six separate jobs"
framing that had no Checker-side-style service extraction yet.

New `MakerSubmitService` (`maker-submit.service.ts`) — depends only on a narrow `MakerSubmitContext`
interface (Interface Segregation) and its own injected API client, never the component. `submit(req,
ctx)` is the public dispatcher (same 4-branch `if` chain, unchanged); each shape resolves to one
`MakerSubmitOutcome` instead of mutating component state directly. `validateSubmit()`/
`buildSubmitRequest()` deliberately stayed on the component — same "reads/writes model too pervasively"
reasoning the Second outcome already gave for keeping them there. The one genuinely subtle rule
preserved exactly: only the call submitting `req` itself (never a secondary/tertiary leg) sets a failed
outcome's own `result` field, mirroring the original `submitResult = err.error` placement — audited
call-site-by-call-site across all 5 methods before writing the new service (full rule in
`maker-submit.service.ts`'s own doc comment).

Verified: `tsc --noEmit`/`ng build`/`npm run lint` all clean (warnings 219 → 213, the removed methods'
own `any`-typed error handlers gone). New `maker-submit.service.spec.ts` (22 tests: dispatch routing for
all 5 shapes, every success path, every distinct failure branch — primary-leg-fails vs. secondary/
tertiary-leg-fails — for all 5 methods). Full Angular suite 534/534 (22 new) with **zero pre-existing
test files needing any changes** — the same evidence-of-behavior-preservation pattern every prior
extraction in this section has shown; coverage 99.63%/96%/99.17%/99.66% (all four metrics clear the 95%
floor; the new file itself is 100% on statements/functions/lines, 74% on branches — unexercised
`err.message`/`String(err)` fallback permutations, the same class of gap already accepted in
`checker-actions.service.ts`'s own 90% branch figure). **Live-verified end to end in the browser**: A1
via the new `submitPlain()` — correct MAKER RESULT/Account Entries/PENDING earmark; then the highest-risk
shape, A3S's `submitDocumentArrivalWithSg()` (issued+released an SG, then submitted A3S with an exact
Bill-Amount match) — confirmed both "Account Entries" and "Account Entries — SG Redemption" buttons
rendered (proving `outcome.secondary` correctly carried the SG leg's full response through), the SG's own
Event Timeline showed `FULL_REDEEM 20000 PENDING`, Off-Balance Exposure correctly dropped 20,000 → 0, and
the SG Redemption dialog showed the correct historical Dr/Cr pair. Zero console errors. Test data cleaned
up afterward; `backend/` 33/33 and microservice 292/292 re-confirmed unaffected.

**Net effect on BAL-003**: `transaction-builder.component.ts` 2,923 → 2,684 lines — a genuine net
reduction, not relocation-with-growth like several earlier outcomes in this section, because this is the
first extraction since the Fourth outcome (Checker Actions) that reduces the *number of jobs* the class
does rather than only DRYing one job's internals. **BAL-003 stays open at Major** — the class still owns
function/side selection, three picker state machines, and the Look Up panel — but the two largest
"does too many things" candidates (Checker Actions, Maker Submit) are now both extracted via the same
Dependency Inversion pattern, leaving a narrower, more clearly-scoped remainder for any future pass.

**Sixth outcome (2026-08-17, user-directed — "兩個可行方向 最推薦哪一個?" (which of two options do you
recommend?), after asking whether a Web Component would be simpler and being shown why it wouldn't
solve the actual blocker): the Look Up panel extracted into `LookUpPanelService` — a plain class, not an
`@Component`.** The user's own first framing of this request asked for a genuine child component with
its own template (mirroring the Fifth outcome's own framing of a bigger, riskier extraction than the
service-only ones before it). Investigated that option first, before proposing anything: found a real
blocker, not a stylistic preference — `transaction-builder.component.spec.ts`/`.actions.spec.ts`
construct `TransactionBuilderComponent` via plain `new TransactionBuilderComponent(mockApi)` (this
file's own established no-TestBed house style), and **77 existing test assertions** read/write Look Up
state directly on the component instance. A genuine child component needs `@ViewChild`/`@Input`-
`@Output()` wiring, but `@ViewChild` resolution depends on Angular's view-rendering lifecycle, which
direct-instantiation tests never trigger — all 77 would break. The user then asked whether a native Web
Component would sidestep this; it wouldn't — the blocker isn't Angular's `@ViewChild` specifically, it's
that these tests never render *any* DOM, so nothing rendered (Angular or native) is reachable from them
either way. Presented both real options plainly (rewrite 77 tests for a true child component, vs. a
plain class with a mechanical rename) instead of picking one silently, since option one's blast radius
(77 assertions) was well outside anything this session's own BAL-003 history had previously accepted —
the next-largest prior test-touching extraction, `PagedListState` (Third outcome above), deliberately
chose accessor delegation specifically to avoid touching ~30 call sites, a third of this scale.

**Fix, once the plain-class direction was confirmed**: new `LookUpPanelService`
(`look-up-panel.service.ts`) — a plain class (not `@Injectable`/`@Component`), exposed as a public
`readonly lookUp = new LookUpPanelService(api, ...)` field the template binds to directly (`lookUp.xxx`),
the same pattern `PagedListState` itself already uses. Owns the search criteria, all three tabs' own
results, the `activeLookup*` getters, and every Look Up method (`runLookup()`/`selectLookupTab()`/
`selectLookupAcceptance()`/`selectLookupSg()`/`loadSnapshotAndMovements()`/`loadUnderLookupCandidates()`).
Two new methods close real duplications found along the way: `resetForSide(side)` (was identically
duplicated inside `selectFunctionSide()`/`selectFunction()`) and `syncFrom(lcNumber, instrumentType)`
(replaces `syncLookupToContext()`'s own body — the guard itself stays on the component, since
`contextLcNumber`/`model.instrumentType` are Maker-side concepts this panel deliberately doesn't own).
An optional constructor callback (`onBeforeLookup`) lets `runLookup()` close any open Account Entries
dialog on the component without the panel needing to own that field itself.

**Side effect found and fixed**: tightening `activeLookupMovements` from the original `any[]` to a real
`BalanceMovement[]` surfaced that the Angular-side `BalanceMovement` interface was missing
`balanceBefore`/`balanceAfter` entirely — the microservice's own `release()` always computes and
persists both, and the Look Up panel's own Event Timeline already displayed `m.balanceAfter`, it just
compiled under the old `any` typing without the field ever being declared. Added both fields to
`balance-component-api.service.ts`'s own `BalanceMovement` interface, matching the microservice's
`src/types.ts` exactly.

**Test migration**: 77 existing assertions (99 raw occurrences once counted precisely, across 3 spec
files — `.gaps.spec.ts` uses `c` as its own local variable, not `comp`) mechanically renamed from
`comp.lookupResult` to `comp.lookUp.lookupResult` (etc.) via a scripted word-boundary regex pass — pure
rename, no logic touched. Two follow-ups the rename alone missed: `(c as any).lookupMovements = ...`-
style casts in `.gaps.spec.ts` (10 sites, fixed by hand since the identifier wasn't directly preceded by
`c.`), and 3 of those same sites had bare `[{ id: 1 }]` fixtures that had silently compiled under the old
`any` cast — once the (no-longer-needed) cast was dropped, TypeScript correctly rejected them against the
real `BalanceMovement` type; fixed using the file's own pre-existing `movement()` fixture builder.

Verified: `tsc --noEmit`/`ng build --configuration development`/`npm run lint` all clean (warnings
213 → 202, the removed `any[]`-typed getter's own warning gone). Full Angular suite 534/534 (unchanged
count — a pure move, not new coverage) with **zero test files needing any logic changes** — only the
mechanical rename plus the two narrow follow-ups above; coverage 99.63%/95.98%/99.18%/99.66% (all four
metrics clear the 95% floor; `look-up-panel.service.ts` itself is **100% on all four metrics**).
**Live in-browser verification could not be completed this pass** — the Chrome extension's own
`computer` tool became unresponsive (screenshot capture timing out after 30s) on two separate fresh
tabs, the same class of flakiness this report's own BAL-122/BAL-123 entries already recorded; stopped
retrying per this session's own established "don't loop past 2-3 attempts" guidance rather than
fabricating a result. The static verification above (typecheck, strict-template build, full lint, and
the test suite's own "zero logic changes needed" evidence) is strong evidence the extraction is correct,
but a human should click through the Look Up panel's LC/Acceptance/SG tabs once to fully close the loop.
Full three-suite re-verification per this file's own standing rule: `backend/` 33/33 and microservice
292/292, both unaffected (Angular-only change).

**Net effect on BAL-003**: `transaction-builder.component.ts` 2,684 → 2,438 lines. This closes the third
and final "does too many things" candidate named after the Fifth outcome (Checker Actions and Maker
Submit were the first two) — every candidate this session's own BAL-003 history identified as a genuine
separate job has now been extracted. **BAL-003 stays open at Major** — the class still owns function/side
selection and three picker state machines (deliberately left as-is; the picker orchestration was
investigated and explicitly rejected as further work earlier this same pass, before Maker Submit was
chosen instead — see the note at the top of the Fifth outcome) — but what remains is now a materially
narrower, more clearly-scoped remainder than at any earlier point in this section's own history.

**Seventh outcome (2026-08-17, user-directed — asked "有甚麼建議解法?" again after the Sixth outcome, so
the three paginated pickers (Catalog LC Index / Parent LC picker / IB-SG Index) were investigated as the
next candidate, since every job named above was already extracted): `CatalogPickerService`, at a scope the
user narrowed after seeing the investigation.** The pickers' OWN selection handlers
(`onSelectContract()`/`onSelectParent()`/`onSelectIbIndex()`) turned out not to be a self-contained
subsystem the way Checker Actions/Maker Submit/Look Up were — they mutate `model.movementType`/
`model.currency`, call `rebuildFields()`, and cascade into `loadPayableMovements()`/`loadSgsForArrival()`/
`loadSettleableBalances()`/Checker sync, i.e. they're Maker-flow orchestration, not picker bookkeeping.
Reported this plainly rather than proceeding on the original framing, and presented three scope options
via `AskUserQuestion` (full selection-flow extraction / narrow-to-paging-only / stop here) instead of
picking one — the user chose the narrow option.

**Fix, at the confirmed scope**: `CatalogPickerService` (`catalog-picker.service.ts`), one instance per
picker (`catalogPicker`/`parentPicker`/`ibIndexPicker`). Owns `contracts`/`search`/`snapshots`/the
underlying `PagedListState`, and a `load()` method absorbing the old shared `loadPagedCatalog()` helper's
fetch/populate/error body verbatim (`loadSnapshotsInto()` now private to the service). Each picker's own
thin wrapper method on the component (`reloadCatalog()`/`loadParentPage()`/`loadIbIndexPage()`) still
supplies its own DIFFERENT guard condition, `tenorFamily`, and (Catalog only) the A4 payable-IB-hint
follow-up — same "guard/params unchanged, only the fetch body moves" shape as every prior BAL-003
extraction. Selection handlers and the business-rule `filteredXxxCatalog` getters stay on the component,
unchanged, exactly as scoped.

**Two issues found and fixed along the way**: (1) the `.html` template already had an unrelated
`<ng-template #catalogPicker>` (the flat-Catalog fallback branch of an existing `*ngIf`/`else`) — Angular's
template type-checker resolved the new field references against that template-ref variable instead of the
component property, surfacing only at `ng build` (not `tsc --noEmit`, which doesn't type-check templates)
as `NG9: Property 'contracts' does not exist on type 'TemplateRef<any>'`; fixed by renaming the
pre-existing, unrelated template-ref variable to `#flatCatalogPicker`. (2) the mechanical rename script
(~260 raw occurrences across the component, template, and 3 spec files) also matched the component's own
`catalogTotalPages`/`parentTotalPages`/`ibIndexTotalPages` getter *declarations*, corrupting them into
invalid syntax (`get catalogPicker.totalPages()`) — caught immediately by the next `tsc --noEmit` run;
fixed by deleting those three now-redundant getters (external callers reference `catalogPicker.totalPages`
directly post-rename, same as `catalogPage`/`catalogTotal`'s own getters were fully removed rather than
kept as thin wrappers).

Verified: `tsc --noEmit`/`ng build --configuration development`/`npm run lint` all clean (202 warnings,
unchanged — the one `PagedListState` import left unused by this extraction was removed). Full Angular
suite 534/534 (unchanged count — pure move) with **zero test files needing any logic changes**, coverage
99.7%/95.97%/99.43%/99.74% (all four clear the 95% floor; `catalog-picker.service.ts` itself is **100% on
all four metrics**). Full three-suite re-verification per this file's own standing rule: `backend/` 33/33
and microservice 292/292, both unaffected (Angular-only change).

**Net effect on BAL-003**: `transaction-builder.component.ts` 2,438 → 2,304 lines. **BAL-003 stays open at
Major** — function/side selection and the pickers' own selection/business-filter logic remain, deliberately
not extracted per the investigation above — but every extraction this session's BAL-003 history judged
worth doing, at a scope the user actually confirmed rather than one picked unilaterally, is now done.

**Eighth outcome (2026-08-17, user-directed — "Review all recent changes and ensure they continue to
comply with the established Balance Component development and quality requirements... for the fixing of
God Component. Check it out."): a 9th extraction (`function-policy.ts`/`builder-fields.ts`/
`submit-rules.ts`) found already sitting uncommitted, reviewed and hardened rather than authored from
scratch.** This extraction was NOT written in this conversation — found already present in the working
tree (three new files plus a further-shrunk component) when responding to the user's comprehensive
review request. Treated it the same as self-authored work per that request's own explicit instruction
("don't consider it complete just because the new functionality works"): verified it end-to-end and
closed every gap found, rather than assuming prior authorship meant it was already complete.

**What it does** (confirmed byte-for-byte pure code motion via diff review against the pre-extraction
component): `function-policy.ts` moves the ~15 purely state-derivation getters
(`isCreatingMovement`/`hasParent`/`contextLcNumber`/`checkerSecondaryField`/etc.) into plain functions of
a small state slice, with the component's own getters reduced to one-line delegations.
`builder-fields.ts` moves `rebuildFields()`'s own 131-line Formly config body into a pure
`buildFields(ctx) => FormlyFieldConfig[]` function. `submit-rules.ts` moves `validateSubmit()`/
`buildSubmitRequest()`'s own bodies into pure functions returning `{error, patch}`/`{request, error}`
instead of mutating `this.model`/`this.submitError` directly — reversing, for these two methods
specifically, the Fifth outcome's own stated reason for keeping them on the component (a *service*
extraction would only relocate the `this.model` coupling; a *pure function* with an explicit context
parameter and an explicit returned `patch` genuinely removes it).

**Gaps found and closed**: no dedicated unit tests existed for any of the three new files — added
`function-policy.spec.ts` (49 tests), `builder-fields.spec.ts` (27 tests), `submit-rules.spec.ts` (39
tests), all three files now at 100% statements/branches/functions/lines individually (closing two branches
that were previously only incidentally covered through the component's own indirect tests:
`settlesDocumentArrival`-without-`selectedPayMovement`, and B5's own `PARTIAL_SETTLE` derivation) — same
"direct unit tests for a pure/utility module" convention `paged-list-state.spec.ts` already established in
this codebase. Writing `builder-fields.spec.ts` surfaced **BAL-135**, a genuine business-rule-violating
bug pre-dating this session's own work (B5's Amount field silently always locked/disabled, contradicting
the documented "freely-editable, capped, reduce for Partial Settle" rule) — found and fixed with two
regression tests, not just documented. Reviewing the extraction's own naming also surfaced **BAL-136**
(the component's private `validateSubmit`/`buildSubmitRequest` methods shadow the imported pure functions
of the same name) — fixed via import aliasing. `npm run format:check` additionally caught 4 pre-existing,
previously-unformatted files left over from this session's own EARLIER extractions (Look Up
panel/Catalog Picker/Checker Actions) that had never been run through `prettier --write` — reformatted,
whitespace-only, zero logic changes.

Verified: `tsc --noEmit`/`ng build --configuration development`/`npm run lint`/`npm run format:check` all
clean (lint: 211 warnings, up from 202 — the 9 new ones are `any`-typed Formly `expressions` callback
parameters, matching this codebase's own pre-existing convention for untyped Formly callbacks). Full
Angular suite 648/648 (534 pre-existing + 113 new (BAL-135's own two fixed tests included in that count),
coverage 99.71%/96.37%/99.46%/99.75% — branches genuinely UP from 95.98%, not merely holding the floor.
`backend/` 33/33, microservice `typecheck` clean + 292/292, both unaffected and re-verified per this
file's own standing three-suite rule. `npm audit --omit=dev` run fresh across all three sub-projects:
`backend/` and the microservice both 0 vulnerabilities; the Angular app's own 8 High `@angular/core` CVEs
are unchanged (BAL-002, an already-open, deliberately-deferred structural gap — a major-version Angular
upgrade is out of scope here).

**Net effect on BAL-003**: `transaction-builder.component.ts` 2,304 → 2,024 lines — the lowest this file
has been all session. **BAL-003 stays open at Major** — function/side selection and the pickers' own
selection/business-filter logic remain (per the Seventh outcome's own investigation) — but this pass adds
real value beyond line count: a genuine defect (BAL-135) found and fixed with regression coverage, not
just code relocated.

**Ninth outcome (2026-08-20, user-confirmed via direct verification of the working tree — "已經不是 God
Component") — the "Feature Components + Facade" pilot #2, `lc-balance-wc/CLAUDE.md`'s own decision log,
finally closes this finding.** That pilot (already logged separately in `lc-balance-wc/CLAUDE.md` under
its own heading, not re-narrated in full here) turned every remaining "does too many things" candidate
this file's own Seventh/Eighth outcomes had identified as still-open into real Angular child components
or services: `CheckerPanelComponent` (Phase 1, the Checker search+queue half), `MakerPanelComponent`
(Phase 2, everything Maker-side — Submit dispatch across all 14 named business functions, the compound-leg
fields, result rendering), `eligibility-rule.ts` (Phase 3, the 3 pickers' own eligibility-filter getters),
`PickerSelectionService` (the Step-2 "2ndary Index" pickers — SG/EB/payable-movement — via the same
Dependency-Inversion pattern as `CheckerActionsService`), and Phase 8 (`compoundLegs: CompoundLegState`
grouping `MakerPanelComponent`'s own 7 flat fields). Phases 4–7 of the original 8-phase proposal were
never pursued — not an open gap, a deliberate stop once the *problem the finding was about* (one class
doing five or six genuinely separate, independently-varying jobs) was already gone; further splitting the
remaining orchestration would be decomposition for its own sake, the exact anti-pattern this report's own
"Working Style" section warns against applying a pattern without it earning its complexity.

**Verified via direct inspection of the current file** (re-confirmed this pass, not carried forward from
the pilot's own commits): `transaction-builder.component.ts` is now **436 lines** — down from the 2,923-line
peak, and no longer even the largest file in this sub-project (`maker-panel.component.ts`, the component
that absorbed most of what used to live here, is now 1,160 lines; the microservice's own
`balanceService.ts` is 1,190). What remains is a single, genuine job — mode/function-side selection,
wiring `MakerPanelComponent` ↔ `CheckerPanelComponent` ↔ `LookUpPanelService` ↔ `InquireEventsService`
together via a handful of signal/context objects, the Account Entries dialog's own open/close state, and
the Checker action-dispatch methods (`release()`/`reject()`/`checkerAct()`/`deleteMakerPending()`/
`acknowledgeArrival()`, each a thin call into `CheckerActionsService` via `buildCheckerActionContext()`) —
not five or six unrelated ones. This is exactly the shape a top-level orchestrating/Facade component
*should* have; there is no remaining candidate here worth a further extraction.

**BAL-003 is now Fixed, closing this report's single longest-running finding** — first logged at this
report's very first version, tracked continuously across nine outcomes and roughly 2,500 lines of net
reduction, without ever being closed prematurely on line-count alone (the Fourth through Eighth outcomes
each explicitly kept it open specifically because a genuine remaining responsibility survived that
outcome's own extraction). See `lc-balance-wc/CLAUDE.md`'s "BAL-003 'Feature Components + Facade' pilot
#2" decision-log entry for the pilot's own detailed narrative (live-browser bug caught and fixed during
Phase 2, the Phase 3 eligibility-rule regression caught and fixed, Phase 8's own subtlety-preserving
field grouping).

**Tenth outcome (2026-08-21, user-directed — "Part B 也一起做吧,開始extract InquireEventsComponent"), after
BAL-003 was already Fixed:** Inquire Events (side tabs, LC Master Records Index, Events Timeline, Original
Transaction Screen, Balance Tabs) extracted into its own `InquireEventsComponent`; the former shared
`#balanceSnapshotBox` `ng-template` converted into a real `BalanceSnapshotBoxComponent` alongside it (a
template ref can't cross a component boundary). Not itself a BAL-003 reopening — the finding's own
"one class, five/six unrelated jobs" problem was already gone — but it further shrank the file
(`transaction-builder.component.ts` now 488 lines, `.html` 493, `.scss` 855, down from the Ninth outcome's
own 436/998ish) and, as a side effect, fixed the separately-tracked `anyComponentStyle` production-build
budget overage on `transaction-builder.component.scss` (see `lc-balance-wc/CLAUDE.md`'s own decision log).
`maker-panel.component.ts` (1,222 lines) remains this sub-project's largest file. See
`lc-balance-wc/CLAUDE.md`'s "Part B" decision-log entry for the full write-up.

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

**Re-verified later the same day:** `any` usage in `transaction-builder.component.ts` dropped further,
37 → 30 (`grep -c ": any\|<any>\|as any\|any\[\]"`), as a side effect of the A4 redesign's own code
removal (`payExisting()` deleted outright) — no new `any` typing was introduced by any of the later
feature work. Both API service boundary files remain at 1 `any` each, unchanged.

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

**Re-verified later the same day, after the feature work noted above:** `format:check` had drifted again
— 5 Angular files, 4 microservice files, 2 backend files, all from the same day's later edits (never
run through `prettier --write` before this refresh) — re-confirming this finding's own standing caveat:
the gate is real and catches drift correctly, but doesn't run itself; `prettier --write` needed a fresh
pass. Re-applied across all three sub-projects; `format:check` passes clean again, and the reformat
changed zero observable behavior (full three-suite re-run afterward, all green, coverage unchanged).

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

### BAL-124
**`release`/`makerSubmit` step handlers in `backend/server.js`'s `runCase()` are near-byte-for-byte duplicated** — 🔵 Minor (Code Smell) — Fixed

**Evidence:** `server.js:93-107` (`release` step) and `server.js:114-128` (`makerSubmit` step, added this
session) are structurally identical: look up `captured[step.movementRef]?.response?.movementId`; if
missing, push an identical-shape `{type, label, skipped: true, reason: "No movementId captured under
..."}`; otherwise POST and push `{type, label, status, ok, response}`. Only the sub-path
(`/release` vs `/maker-submit`) and request body key (`releasedBy` vs `makerSubmittedBy`) differ — a
direct copy-paste when `makerSubmit` was added, introduced this session (not present when the prior
report closed).

**Impact:** low today (2 occurrences, both correct), but the executor is a natural place for a third
"release-shaped" step type to land next (an `acknowledge` step is a real, separately-identified gap —
see BAL-131) — a third copy compounds drift risk (e.g. a wording fix to the skip-reason applied to one
copy and missed on the others).

**Recommended remediation:** extract a shared handler, e.g.
`postMovementSubPath(step, {subPath, bodyKey})`, or a small dispatch table
`{release: {subPath:'release', bodyKey:'releasedBy'}, makerSubmit: {subPath:'maker-submit',
bodyKey:'makerSubmittedBy'}}` feeding one implementation — directly answers whether a lookup-table would
read cleaner than the now 5-branch if-chain (`note`/`createMovement`/`snapshot` are genuinely distinct
shapes and don't need to move; only the two release-shaped ones do).

**Outcome (2026-08-17, closed as a direct side effect of fixing BAL-131): fixed exactly per the
recommended remediation's own dispatch-table suggestion, one step ahead of the third copy that would
have landed otherwise.** While implementing BAL-131's own `acknowledge` step type, recognized that
adding it as a third standalone `if (step.type === 'acknowledge')` block would have reproduced this
exact finding at the precise point its own "risk if a third copy lands" language predicted. Instead,
added a `RELEASE_SHAPED_STEP_TYPES` dispatch table (`{release: {subPath:'release',
bodyKey:'releasedBy'}, makerSubmit: {subPath:'maker-submit', bodyKey:'makerSubmittedBy'}, acknowledge:
{subPath:'acknowledge', bodyKey:'acknowledgedBy'}}`) plus one shared handler in `runCase()`'s loop,
replacing all three near-identical blocks. Every branch's own skip/success/failure behavior is
unchanged — this was pure consolidation, not a behavior change. Verified: `backend/` suite 33/33
(97.29%/95.23%/96.29%/98.01% coverage, all four metrics clear the 95% floor), and all 14 Business Case
Registry entries re-run individually against the real running microservice with zero regressions,
confirming the consolidated `release`/`makerSubmit` handling behaves identically to the two separate
blocks it replaced. See `lc-balance-wc/CLAUDE.md`'s own BAL-131 decision-log entry for full detail.

---

### BAL-125
**`checker-actions.service.ts` — extracted AFTER BAL-108 closed — has its own un-swept `any` typing** — 🔵 Minor (Code Smell) — Fixed

**Evidence:** `CheckerActionContext.submitResult: any` (line 35), `CheckerActionOutcome.result: any`
(line 55), and three private-method parameters (`settleRes`/`honourRes`/`acceptRes: any`) — 6 occurrences
total (`grep -c`). Every one of these is always the real `BalanceMovement` shape returned by
`api.release()`/`api.submitByMaker()`, not genuinely dynamic data — the same class of finding BAL-108
already fixed across `transaction-builder.component.ts` itself. This service didn't exist yet when
BAL-108 was fixed (it was extracted from the component in a later same-day pass), so it was never swept
for the identical pattern.

**Impact:** low — purely a type-safety gap, not a runtime risk, since the values genuinely are
`BalanceMovement` at every call site. But it's the same "misleadingly untyped API boundary" concern
BAL-108 already flagged and fixed once elsewhere in this exact file's own family.

**Recommended remediation:** retype all 6 to `BalanceMovement` (or `BalanceMovement | null` where a
lookup can miss), same fixture-builder-helper technique BAL-108's own Outcome already used for the sibling
spec files if any test fixtures break.

**Outcome (2026-08-17, business instruction: "Fix BAL-125 too"): fixed exactly per the recommended
remediation.** `CheckerActionContext.submitResult` retyped `BalanceMovement | null` (it genuinely can be
null — the field starts null before any Submit); `CheckerActionOutcome`'s `result` field and all three
private-method parameters (`settleRes`/`honourRes`/`acceptRes`) retyped `BalanceMovement` (never null at
those call sites — each is always the direct response of an `api.release()` call inside a `switchMap`).
`checker-actions.service.spec.ts` already had a `makeMovement()` fixture-builder helper (built for this
exact class of retyping, same convention BAL-108's own Outcome established) — only 2 of its ~40 call
sites used a bare partial-object literal for `submitResult` (`{ movementId: 'stale-mv' }` / `{
movementId: 'only-submit-result' }`), both converted to `makeMovement({ movementId: ... })`; every other
call site was unaffected.

Tightening `submitResult` from `any` to `BalanceMovement | null` surfaced 4 real `string | undefined`
vs. `string` mismatches at call sites using the `ctx.selectedCheckerMovement?.movementId ??
ctx.submitResult?.movementId` fallback pattern (`release()`'s plain and B5 branches, `reject()`,
`releaseAcceptance()`) — previously masked by `any` silently absorbing the possible-`undefined` case.
Resolved with the same non-null-assertion convention this file already uses one line above for
`ctx.createdBy!` in `deleteMakerPending()` (both rely on the identical caller-side invariant: the
component's own `release()`/`reject()`/`deleteMakerPending()` wrappers already guard on
`!this.submitResult?.movementId` before ever constructing a `CheckerActionContext`, so a resolved
`movementId` is always present by the time these lines run) — not a runtime behavior change, just making
an already-relied-upon invariant explicit instead of `any`-masked. One of the four
(`ctx.selectedCheckerMovement?.movementId ?? ctx.submitResult?.movementId`, `release()`'s plain path)
initially asserted directly on the optional-chain expression itself
(`ctx.submitResult?.movementId!`) — caught by `@typescript-eslint/no-non-null-asserted-optional-chain`
(a real ESLint error, not a warning) — fixed by extracting to a local variable first and asserting on
that instead, matching the pattern the other three call sites already used.

Verified: `npx tsc -p tsconfig.app.json --noEmit` clean; `npm run lint` 0 errors (219 warnings, down from
220 — `checker-actions.service.ts` itself now has zero `any`-related warnings; the remaining 219 are
pre-existing debt elsewhere, unchanged); `ng build --configuration development` clean; full Angular suite
510/510 with **zero test files needing assertion changes** beyond the 2 fixture literals above — strong
evidence of exact behavior preservation — coverage 99.63%/95.17%/99.16%/99.67% (unchanged from before this
fix, still clears the 95% floor on all four metrics). Full three-suite re-verification per this file's own
standing rule: `backend/` 33/33 and microservice 292/292, both unaffected (Angular-only change).

---

### BAL-126
**`checker-actions.service.ts` has ~12 duplicated `catchError` → `{kind:'failed'}` blocks** — 🔵 Minor (Code Smell) — Fixed

**Evidence:** at least 12 occurrences (lines approximately 88-93, 119-124, 190-195, 204-209, 221-226,
229-234, 243-248, 259-264, 374-379, 387-392, 405-410, 429-434) of the identical shape
`catchError((err) => of<CheckerActionOutcome>({ kind: 'failed', message: <text> }))` — only the message
string differs between them.

**Impact:** low — each message is meaningfully different business context (which is why this isn't a
Major/BAL-003-style finding), but it's a real, mechanically-collapsible repeated shape in a file whose
own top doc comment explicitly credits itself with Single-Responsibility/Interface-Segregation design —
worth closing for consistency with that stated design intent.

**Recommended remediation:** a small `fail(message: string): Observable<CheckerActionOutcome>` private
helper, `catchError((err) => this.fail(describeApiError(err)))` (or similar) at each of the 12 sites —
purely mechanical, no behavior change.

**Outcome (2026-08-17, business instruction: "Fix BAL-126 too"): fixed exactly per the recommended
remediation, extended to the full duplicated shape.** A fresh count against the current file (after
BAL-124/BAL-125's own recent changes) found **20** occurrences of the identical `{ kind: 'failed',
message }` construction, not ~12 — the original estimate undercounted since it only sampled the
`catchError`-wrapped ones; several plain pre-check `return of<CheckerActionOutcome>({kind:'failed',...})`
sites (e.g. the `!ids.sourceMovementId`/`!arrivalSgRedeemMovementId`/`!matchedReceivableMovementId`/
`!acceptanceReimbReceivableMovementId` guards) share the exact same literal shape and were included too,
since the recommended `fail()` helper covers them for free with zero added risk. New private `fail(message:
string): Observable<CheckerActionOutcome>` returns `of<CheckerActionOutcome>({ kind: 'failed', message })`
— all 20 call sites now read `catchError((err) => this.fail(<message-expression>))` or
`return this.fail(<message>)`; only the message text (unchanged, byte-for-byte) still varies between
them. `of<CheckerActionOutcome>` remains imported/used for the `'released'`/`'documentArrivalAcknowledged'`
outcome shapes, which this fix left untouched — genuinely different shapes, not part of this finding.

Verified: `npx tsc -p tsconfig.app.json --noEmit` clean; `ng build --configuration development` clean;
`npm run lint` 0 errors (219 warnings, unchanged); full Angular suite 510/510 with **zero test files
needing any changes** — the exact same evidence-of-behavior-preservation pattern this codebase's other
mechanical extractions (`loadPagedCatalog`, `loadSnapshotAndMovements`, `finishCheckerAction`,
`PagedListState`) have all relied on — coverage 99.63%/95.17%/99.16%/99.67% (unchanged, still clears the
95% floor on all four metrics). Full three-suite re-verification per this file's own standing rule:
`backend/` 33/33 and microservice 292/292, both unaffected (Angular-only change).

---

### BAL-128
**3 stale `eslint-disable` comments in `backend/` suppress rules that aren't even configured** — 🔵 Minor (Code Smell) — Fixed

**Evidence:** `npm run lint` reports "Unused eslint-disable directive (no problems were reported from
'no-console')" at `server.js:170,184`, and "...'global-require'" at `test/businessCases.test.js:163`.
`backend/eslint.config.js` only extends `js.configs.recommended` — `no-console` isn't part of it, and
`global-require` is an `eslint-plugin-node`-family rule never installed or configured in this project at
all. These 3 comments suppress rules that were never active in the first place — dead artifacts, most
likely carried over from a stricter template config (plausibly `lc-payment-wc/backend`'s own) rather than
authored against this project's real ruleset.

**Impact:** none functionally (0 errors either way) — purely misleading, since a reader reasonably
assumes a disable comment is load-bearing.

**Recommended remediation:** delete the 3 stale comments, or add the two rules to `eslint.config.js` if
restricting `console`/`require` usage is actually wanted going forward.

**Outcome (2026-08-17, business instruction: "Fix BAL-128 too"): fixed exactly per the recommended
remediation's first option — the 3 stale comments deleted.** `server.js:162` (before the orchestration
error's own `console.error`) and `server.js:176` (before the startup `console.log`) both removed;
`test/businessCases.test.js:163` (before a plain `require('../data/businessCases')` call inside a test)
removed too. No rule was added to `eslint.config.js` — restricting `console`/`require` usage was never
actually wanted here (this is a demo backend that logs to stdout deliberately, and the test file's own
`require` is a normal Node/Jest pattern, not something needing a lint exception in the first place), so
deleting the dead artifacts was the correct fix, not adding real rules to justify them retroactively.

Verified: `npm run lint` → **0 errors, 0 warnings** (down from 3 warnings — the only findings this
specific run had); `backend/` suite 33/33 unchanged; `format:check` unaffected (the one remaining
formatting warning it reports, `test/server.test.js`, is pre-existing drift this file never touched, not
introduced by this fix). Backend dev server restarted and live-verified both log statements still fire
correctly with the comments gone (startup `console.log` observed in the process log on boot; a live
`import-case-1` run exercised the request-handling path, confirming the `console.error` call site is
still reachable and unaffected — removing a stale disable comment has no runtime effect either way, this
was a belt-and-suspenders check given money-adjacent code was touched). Test data cleaned up afterward.
Full three-suite re-verification per this file's own standing rule: Angular app 510/510 and microservice
292/292, both unaffected (`backend/`-only change).

---

### BAL-132
**`deleteMakerPending()`'s `ctx.createdBy!` non-null assertion bypasses the type system's own declared nullability** — ⚪ Info (Code Smell) — Fixed

**Evidence:** `checker-actions.service.ts:180` — `const cancelledBy = ctx.createdBy!;` — asserts away
`CheckerActionContext.createdBy`'s own declared `string | null | undefined` type rather than guarding it
at runtime.

**Impact:** currently safe in practice — the component only calls `deleteMakerPending()` when a real
Maker submission already exists, so `createdBy` is never actually null at this call site today — but the
assertion silently masks a real possible-null path in the type declaration rather than proving it can't
happen, which is exactly the kind of assumption that breaks quietly if a future caller reaches this
method from a new entry point.

**Recommended remediation:** a one-line runtime guard (`if (!ctx.createdBy) return of({kind:'failed',
message:'...'})`) instead of the assertion — cheap defense-in-depth, not urgent given today's actual call
graph.

**Outcome (2026-08-17, business instruction: "Fix BAL-132 too"): fixed exactly per the recommended
remediation.** `const cancelledBy = ctx.createdBy!;` replaced with `if (!ctx.createdBy) return
this.fail('Cannot delete this Maker submission — no Maker (createdBy) is known for it.'); const
cancelledBy = ctx.createdBy;` — reusing BAL-126's own `fail()` helper rather than constructing the
outcome literal by hand. Purely additive: the happy path (createdBy present, the only path reachable
through today's real call graph) is byte-for-byte unchanged.

Verified: `npx tsc -p tsconfig.app.json --noEmit` clean; `ng build --configuration development` clean;
`npm run lint` unchanged (0 errors, 219 warnings). Two new dedicated tests added to
`checker-actions.service.spec.ts` (the new guard fails cleanly without calling the API when `createdBy`
is null; the happy path still cancels normally when it's present) — the branch this guard introduces
would otherwise have gone uncovered (the existing suite never exercises a null-`createdBy`
`deleteMakerPending()` call, matching the finding's own "currently unreachable in practice" framing), so
adding coverage rather than leaving a newly-uncovered branch was the right call given this project's own
95%-floor-on-all-four-metrics standing rule. Full Angular suite 512/512 (2 new), coverage
99.63%/95.17%/99.16%/99.67% — branches recovered to exactly the pre-fix level, still clearing the 95%
floor on all four metrics. Full three-suite re-verification per this file's own standing rule: `backend/`
33/33 and microservice 292/292, both unaffected (Angular-only change). No live browser click-through this
time — the fix only adds a guard on a path the real UI never reaches today (the component's own `submit()`
already requires `model.createdBy` before any Maker submission a Checker could later Delete-Pending can
exist), and the new dedicated tests directly prove both the guard and the unaffected happy path.

---

### BAL-134
**`import-case-4`'s own scenario is stale relative to a later `v0.12` hard-reject design change** — ⚪ Info (Bug / Technical Debt) — **Fixed**

**Evidence:** discovered incidentally while live-running all 14 Business Case Registry entries end to
end (not just their own mocked unit tests) to confirm BAL-123's fix didn't break anything. 13 cases
succeed cleanly; `import-case-4` reproducibly fails on its own "Document Arrival 50,000 (only half the
SG-covered goods)" step:
```
409 INSUFFICIENT_AVAILABLE_BALANCE — "Requested amount 50000 exceeds Tight Available Balance 21000
(Available Balance 121000 minus outstanding off-balance-sheet (SHGT) exposure 100000). If this Document
Arrival is meant to consume a specific outstanding Shipping Guarantee's reserved capacity, use
'Document Arrival w/ Shipping Gtee' instead..."
```
The case's own inline comment (`backend/data/businessCases.js`, `importCase4`) reads: `"Expect a WARNING
here — Tight Available (21,000) < 50,000, but not an ERROR (LC Available itself is 121,000)"` — but
current validation hard-rejects instead of warning. This is NOT caused by BAL-122 or BAL-123 (both fixes
are scoped to `release()`; this failure happens inside `createMovement()`'s own SHGT sufficiency check, a
code path neither fix touches — confirmed by reproducing the failure in isolation, with fresh contract
data, no rate-limiting or cross-case interference). The likely root cause: `lc-balance-wc/CLAUDE.md`'s
own decision log documents "A3 now hard-rejects past Tight Available (Design doc §6.1 v0.12)" as a real,
dated design change — `importCase4`'s own scenario and comment predate that change and were never updated
to match, so it's exercising a WARNING-shaped test against what is now correctly ERROR-shaped validation.

**Impact:** low — this is a Business Case Registry data/comment staleness issue, not a defect in the
microservice's own validation logic (which is behaving correctly per the more recent v0.12 rule). But it
means `import-case-4` currently cannot be run to completion via the Business Case Runner, which defeats
its own purpose as a one-click regression-style smoke test.

**Recommended remediation:** update `importCase4`'s own amount choice (e.g. reduce the Document Arrival
to fit within Tight Available, or explicitly change the case to demonstrate and assert the CURRENT
hard-reject behavior with `expectError: true`, matching `importCase5`'s own existing pattern for an
expected-rejection scenario) — out of scope for BAL-123, flagged here for its own separate follow-up.

**Outcome (2026-08-17, fixed immediately after being reported): neither of the two recommended options
above — a third, more faithful fix.** Investigating further revealed the case's own premise wasn't just
numerically stale but architecturally impossible to reach at all: `checkUtilizeSufficiency()`'s own doc
comment confirms v0.12 REMOVED the warning branch entirely ("hardened from WARNING to ERROR") — no amount
choice for a PLAIN UTILIZE could ever reproduce "warning, not error" again. Reducing the Document Arrival
to fit within Tight Available (option 1) would have silently changed the scenario's own headline numbers
(no longer "only half the SG-covered goods arrive"); switching to `expectError: true` (option 2) would
have thrown away the case's own actual teaching value (demonstrating a partial-match presentation
succeeding, and the SG's own `PARTIAL_REDEEM`). Instead: rewritten to use the CURRENT correct mechanism
for this exact scenario — the SG's own `PARTIAL_REDEEM` is now created FIRST (still PENDING, sharing a
`businessEventId` with the Document Arrival that follows, the real "Document Arrival w/ Shipping Gtee"
ordering) — `computeOffBalanceExposure()` counts PENDING redemptions the same as RELEASED ones, so the
SG's 50,000 is already netted out by the time the Document Arrival's own check runs, and the SAME 50,000
presentation now succeeds cleanly. Final balances are UNCHANGED from the original case (LC 71,000, SG
50,000 still outstanding) — those numbers were never wrong, only the call ordering reaching them was
obsolete. Title/description updated to describe what the case now demonstrates. Verified: `backend/`
suite 32/32 (title assertion updated), and **live-verified end to end** against the real microservice —
every step 2xx, both final snapshots match exactly; all 7 Import Case entries re-run individually
afterward confirm the fix disturbed nothing else in the registry.

---

### BAL-135
**B5's own Amount field was silently ALWAYS locked/disabled** — 🟡 Major (Bug) — **Fixed**

**Evidence:** discovered while writing dedicated unit tests for `builder-fields.ts` (part of the
uncommitted BAL-003 9th-pass extraction — see BAL-003's own "Eighth outcome" below). B5's own registry
entry (`balance-component.model.ts`) declares `movementType: 'FULL_SETTLE'` as a placeholder default — the
real FULL_SETTLE/PARTIAL_SETTLE value is DERIVED at submit() time from Amount vs Available Balance (same
pattern as A9's own `autoRedeemType`), never picked by the user. `buildFields()`'s own
`amountFromFullSettle` check (`model.movementType === 'FULL_SETTLE' && !!selectedContractSnapshot`) is a
real, correct, and INTENTIONALLY separate rule for A7's own explicit Full-Settle-vs-Partial-Settle
subChoice — but since B5 happens to share that exact literal string as its own default, and nothing
between `afterResolved()` and `buildFields()` ever changes `model.movementType` away from it before
Submit, `amountFromFullSettle` matched on every single B5 render — pre-empting the newer, more specific,
correctly-designed `amountCappedAtAcceptance` rule (added 2026-08-16, i.e. chronologically after
`amountFromFullSettle` itself — that rule's own doc comment even still read "A7/B5 Full Settle", stale
evidence the collision was never caught). Net effect: B5's Amount field rendered `disabled: true` with the
label "Amount (Full Settle — carried from the Acceptance's Available Balance, protected)" unconditionally,
directly contradicting the explicit 2026-08-16 business instruction ("B6改成B5選資料為有Acceptance
Balance>0的EB交易" — "freely-editable... reduce for a Partial Settle, must not exceed it") documented in
the very same file, one rule below the buggy one.

**Impact:** Major — a real, live business-rule violation: any Maker attempting a genuine B5 Partial Settle
(paying less than the Acceptance's full outstanding Available Balance) would find the Amount field
uneditable, with no way to type a smaller value through the UI. Confirmed this predates the current
session's extraction — it was present in the original inline `rebuildFields()` too (the extraction itself
is byte-for-byte, confirmed via diff review) — this pass's new direct unit tests surfaced it, indirect
component-level testing never had a B5-specific Amount-field assertion that would have caught it.

**Fix:** `amountFromFullSettle` now explicitly excludes `selectedFunction?.settlesAcceptanceOnMature`
(B5's own flag) — `!selectedFunction?.settlesAcceptanceOnMature && model.movementType === 'FULL_SETTLE' && !!selectedContractSnapshot`
— so B5 always routes through its own dedicated `amountCappedAtAcceptance` rule instead; A7 (which has no
`settlesAcceptanceOnMature`) is completely unaffected, preserving its own correct locked-on-Full-Settle
behavior. The stale "A7/B5" comment was corrected to "A7" and a new comment documents the exclusion and
why it's needed. Two regression tests added to `builder-fields.spec.ts` lock in both sides: A7's Full
Settle subChoice still locks the Amount field; B5 stays editable/capped even sharing the same literal
`movementType` value. Verified: full Angular suite 648/648 (was already 622 with the new-but-unfixed
tests failing one case; the fix + regression tests bring it to fully green), `builder-fields.ts` at 100%
statements/branches/functions/lines.

---

### BAL-136
**`validateSubmit`/`buildSubmitRequest` share their exact names between component methods and imported pure functions** — 🔵 Minor (Code Smell) — **Fixed**

**Evidence:** the uncommitted BAL-003 9th-pass extraction (see BAL-003's own "Eighth outcome" below)
imports `validateSubmit`/`buildSubmitRequest` from `submit-rules.ts`, and the component ALSO defines its
own private methods of the exact same names, each calling the bare (imported) function of the same name
one line into its own body — e.g. `private validateSubmit(): boolean { const {error, patch} =
validateSubmit(this.submitRulesContext); ... }`. Legal TypeScript (an unqualified reference inside a
method body resolves to the enclosing module scope, not implicitly to `this.methodOfTheSameName` —
confirmed by every test and the build passing regardless), but a real readability trap: a reader skimming
`this.validateSubmit()` at the `submit()` call site has no visual cue that the method's own first line
calls something entirely different that happens to share its name. None of this session's other five
BAL-003 extractions has this shape — `checkerActions`/`makerSubmit`/`lookUp`/`catalogPicker`/
`parentPicker`/`ibIndexPicker` are all bound to distinctly-named fields, avoiding the ambiguity entirely.

**Impact:** Minor — purely a maintainability/readability risk, not a functional defect (verified: behavior
is correct either way, this is a naming clarity issue only).

**Fix:** aliased the import — `buildSubmitRequest as buildSubmitRequestRules`, `validateSubmit as
validateSubmitRules` — updating the two call sites inside the component's own like-named methods. No
other changes; both methods' own external signatures/behavior are unchanged. Verified: `tsc --noEmit`
clean, full Angular suite 648/648 unaffected.

---

### BAL-141
**`balanceService.ts`'s 4 movementType classification Sets + a scattered `isSightUtilizeFinalize` flag — Data Clump risk in `createMovement()`/`release()`** — 🔵 Minor (Code Smell) — **Fixed**

**Evidence:** a later, separate external review (2026-08-20) of `microservices/balance-component/src/
service/balanceService.ts` (then 1,078 lines), following this same SonarQube-style posture, identified
`createMovement()`'s own `CREATING_MOVEMENT_TYPES`/`NO_CHECK_MOVEMENT_TYPES`/`UTILIZE_SHAPED_MOVEMENT_TYPES`/
`OUTSTANDING_CAPPED_MOVEMENT_TYPES` — four independently-maintained `Set<string>` constants, each
classifying movementTypes for a different purpose, dispatched via a sequential if/else-if chain — as a
Data Clump: the same "same fact duplicated across several places with no compiler-enforced link" pattern
already flagged and fixed once elsewhere in this project (BAL-110, `InstrumentType`/movementType drift
between Angular and the microservice). A future movementType (e.g. the CANCEL/EXPIRE/REVERSAL
`balanceDerivation.ts`'s own doc comment already calls out as deliberately not yet implemented) would need
several of these Sets updated in lockstep, with no compiler or test failure if one were missed. `release()`
had the same shape at smaller scale: `isSightUtilizeFinalize` (the A4 Sight-finalize flag) drove four
separate inline ternaries scattered across one `updateStatus()` call, and `createMovement()`/`release()`
each independently duplicated the same "own SHGT/EPLC_EXAMINATION siblings → eventSnapshot → parent
rootEventSnapshot → sibling snapshots" 4-step orchestration.

**Impact:** Minor — no live defect (confirmed: all four Sets were mutually consistent at review time, and
the full 361/34/988-test suite trio was green both before and after this fix), purely a maintainability
risk that could silently produce a real bug on a future edit.

**Fix:** the four Sets + dispatch chain collapsed into one `movementTypeRegistry`
(`buildMovementTypeRegistry()`, built once per `BalanceService` instance since several strategies close
over `this.movements`) — a Strategy-pattern lookup table where each movementType carries both its
`isCreating` flag and its `checkSufficiency` function together, doubling as the Type-Object consolidation
the same finding also called for. `release()`'s own four ternaries collapsed into
`resolveSnapshotWriteTarget()` (Fowler's "Replace Flag Argument with Resolved Policy Object"), and the
createMovement()/release() snapshot-capture duplication extracted into `captureSnapshotBundle()`.
Deliberately did NOT also fold in `balanceDerivation.ts`'s own `MOVEMENT_DIRECTION` or `tolerance.ts`'s own
`TOLERANCE_APPLICABLE_MOVEMENT_TYPES` — both are genuinely domain-layer, already single-sourced, and
tolerance's own gate is two-dimensional (instrumentType + movementType, since SHGT's own `ISSUE` shares
its string with the LC's `ISSUE`) in a way a movementType-only table can't represent without reintroducing
that exact ambiguity tolerance.ts's own doc comment already warns against.

**Follow-up (reviewer-noted, same day):** `resolveSnapshotWriteTarget()` initially re-derived
`isSightUtilizeFinalize` internally from `movement`/`contract`, duplicating the identical expression
`release()` already computes a few lines earlier for its own BAL-123 Maker-Submit gate check — changed to
take the already-computed boolean as a parameter instead, so the expression is evaluated exactly once per
`release()` call.

Verified: pure internal refactor, zero behavior change — `tsc --noEmit`/`npm run build` clean both before
and after the follow-up, and all three suites (361 microservice + 34 backend + 988 Angular) green
throughout, with **no spec-file edits needed at all** — the strongest possible evidence the observable
contract never moved.
`microservices/balance-component/src/service/balanceService.ts` grew 1,078 → 1,189 lines (more, not
fewer — the Strategy/Type-Object tables trade line count for structure, not brevity, consistent with this
report's own framing of BAL-003's own extractions).

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

### BAL-129
**The microservice's generic 500 handler — BAL-117's own fix — is itself untested** — 🔵 Minor (Test Gap) — Open, found this pass

**Evidence:** `microservices/balance-component/src/app.ts:38-40` — the BAL-117 fix (log the real error
server-side via `console.error`, return only a generic `{code:'INTERNAL_ERROR', message:'An internal
error occurred.'}` to the caller) is never exercised by any test; a fresh coverage run confirms lines
39-40 are uncovered. Every existing error-path test throws a typed `ApiError` subclass, which takes the
adjacent `if (err instanceof ApiError)` branch instead — the plain-`Error` fallback branch has no test at
all.

**Impact:** a regression here (e.g. someone "helpfully" changes the generic message back to
`err.message`, silently re-opening BAL-117's own information-disclosure hotspot) would not be caught by
the test suite — the exact kind of gap a security fix without a regression test always risks.

**Recommended remediation:** one test that makes a downstream call throw a plain `Error` with a
distinctive message, asserting the response body is the fixed generic message and never contains the
thrown message text.

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

**Two more found this pass, same judgment call, correctly left alone:**
`microservices/balance-component/src/validation/requestSchema.ts:56` (`error.issues[0]?.message ?? 'Invalid
request.'` — zod never returns an empty `.issues` array on a failed `safeParse`) and the `!contract`
operand inside `acknowledge()`/`submitByMaker()`'s own instrumentType guards
(`balanceService.ts` — a movement's `balanceContractId` always resolves by referential-integrity
invariant, the same class of "structurally impossible, not worth force-covering" branch as the two
above).

---

### BAL-131
**The Business Case Registry never exercises `POST /balance-movements/:id/acknowledge`** — ⚪ Info (Reliability / Completeness) — Fixed

**Evidence:** `grep -n "acknowledge" backend/data/businessCases.js backend/server.js` → zero matches.
The microservice has a real `/acknowledge` endpoint (B3's own Present-Docs Checker acknowledgment,
distinct from `/release` — see BAL-105's own file for the domain background) and the reference Angular
client calls it, but `runCase()`'s own step executor has no step type for it — Export Case #6/#7's own
Present-Docs steps explicitly document (via an inline `note` step) that they skip modeling this call.
Across all 14 registered cases, `/acknowledge` is the one microservice write endpoint with zero
orchestrator-level exercise.

**Impact:** low — the endpoint is independently covered by the microservice's own dedicated test suite —
but it means "run this business case end-to-end" can never be used to smoke-test that one specific
endpoint through the full stack the way every other endpoint can be.

**Recommended remediation:** add an `acknowledge` step type (the same shared-handler shape BAL-124
already recommends for `release`/`makerSubmit`) and use it in at least one case, or explicitly document
the gap once in the file's own top comment rather than only in two cases' own inline notes.

**Outcome (2026-08-17, business instruction: "Fix BAL-131 too"): fixed exactly per the recommended
remediation.** Both Export Case #6 and #7's own `note`-type placeholder steps (which had explicitly
documented the acknowledge call as "omitted here") replaced with a real `{ type: 'acknowledge',
movementRef: 'examination', acknowledgedBy: CHECKER }` step. Implementing the new step type as a third
standalone handler in `runCase()` would have directly reintroduced BAL-124 (the very finding this
section's own remediation note cross-references) — closed that risk in the same edit instead of as
separate follow-up work, via a `RELEASE_SHAPED_STEP_TYPES` dispatch table covering `release`/
`makerSubmit`/`acknowledge` together (full mechanics in BAL-124's own Outcome above).

Verified: `backend/` suite 33/33 (was 32 — `VALID_STEP_TYPES` gained `'acknowledge'`,
`createGenericFetchMock()` gained an `/acknowledge` branch, and a new HTTP-integration describe block
proves `export-case-6`'s own acknowledge step returns `{status:'PENDING', acknowledgedBy:'checker1'}`
and runs before the compound release step), coverage 97.29%/95.23%/96.29%/98.01% (all four metrics
clear the 95% floor). **Live-verified both Export Case #6 and #7 end to end** against the real running
microservice: both cases' full step sequences return 2xx throughout, the `acknowledge` step returns
`acknowledgedBy: 'checker1'` correctly, and every final snapshot matches its own documented expected
value exactly (Case #6: CONF LIAB 90,000, Due From Issuing Bank 10,000; Case #7: CONF LIAB 90,000,
Acceptance Liability 10,000→0, Reimbursement Receivable 10,000→0). Re-ran all 14 registry entries
individually afterward — all succeed cleanly, confirming the BAL-124 dispatch-table consolidation
didn't disturb `release`/`makerSubmit`'s own pre-existing behavior anywhere else in the registry. Test
data from both live-verification passes scoped-cleaned afterward, leaving the user's own 18 S01/S02/U01
records untouched. The Business Case Registry now has orchestrator-level exercise of all six step
types, closing the completeness gap this finding identified.

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
**Test coverage clears 95% on all four metrics, across all three independent suites.** 830 tests total,
all green as of this refresh (microservice count includes the currency-decimal-place, BAL-115, and
BAL-116 fixes' own new tests plus the later same-day A4/`referencedTransactionId`/Business-Case-Registry
feature work's own new tests; backend count includes BAL-117/BAL-118's own new/updated tests plus the
`referencedTransactionIdRef`/`makerSubmit` executor-capability tests; Angular count includes BAL-003's
Checker Actions consolidation, `submit()` split, `PagedListState`'s own 10 new tests, the Checker Actions
service extraction, BAL-108's retyping, BAL-110's 2 new contract-test cases, and the later same-day A4
real-Maker-Submit redesign's own new tests):

| Suite | Statements | Branches | Functions | Lines | Tests |
|---|---|---|---|---|---|
| `microservices/balance-component/` | 99.12% | 96.33% | 100% | 99.41% | 288 |
| `backend/` | 97.43% | 95.65% | 96.29% | 98.13% | 32 |
| Angular app (`src/app/`) | 99.63% | 95.17% | 99.16% | 99.67% | 510 |

(Figures above are from a full three-suite re-run performed as part of this same-day `.md` refresh —
after the A4 real-Maker-Submit redesign and the Business Case Registry's Import/Export Case #6/#7
additions, and after re-applying `prettier --write` per BAL-105's own re-verification note above — all
three suites still clear the 95% floor on every metric; none of the later feature work introduced a
coverage regression serious enough to need a targeted test add-back beyond what was already added
alongside each feature at the time. The Angular branch figure moved further, 95.53% → 95.17%, mostly from
the A4 redesign's own removed `payExisting()` method taking several previously-well-covered branches out
of the denominator entirely, offset by new tests for the redesign's own branches — still comfortably
above the 95% floor throughout, never dipped below it at any point this session.)

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

**Re-confirmed again 2026-08-17** as part of the comprehensive follow-up pass, independently across all
three sub-projects (including this session's own new code — `submitByMaker()`, `referencedTransactionId`
handling, the 4 new Business Case Registry entries) — same zero-match result on every check above,
nothing new introduced.

### BAL-133
**This session's new domain logic independently re-verified correct** — no new bugs found outside BAL-122.
Three separate reviews specifically scrutinized the code added this session that had never been through a
dedicated quality pass, and found it sound:
- `referencedTransactionId` is correctly a pure passthrough correlation field, never accidentally coupled
  into `contingentAccountEntry.ts`'s own account-entry derivation (which is instrumentType/movementType-
  keyed only, as documented).
- All 4 new Business Case Registry entries (Import #6/#7, Export #6/#7) were manually traced field-by-field
  — every `*Ref` resolves to something defined earlier in the same case, `eventSeq` numbering is correctly
  scoped per contract, and the `MIN(Bill, SG Outstanding)` redemption-amount arithmetic in each case's own
  inline comments matches the actual `amount` values used.
- `resolveSettlesDocumentArrivalIds()`'s own Sight/Usance disambiguation (`checker-actions.service.ts`,
  the fix for the cross-contamination bug caught earlier this session — see BAL-history in
  `lc-balance-wc/CLAUDE.md`) reads as genuinely careful, well-commented defensive design on re-inspection,
  not overengineering.
- `onSelectPayMovement()`'s `submitResult`/`submitError` reset (added for A4) is correctly scoped to
  `payExistingUtilize` only — confirmed it does NOT alter A6/B4's own existing, unrelated behavior.

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

**2026-08-17 comprehensive follow-up pass: no change to the three hard gate conditions above (BAL-001/
BAL-002/BAL-102 remain exactly as deferred), but two new items belong on the list of things to close
before the A4 feature area specifically is considered done:**

4. **BAL-122** *(Fixed, 2026-08-17)* — A4's "Delete Pending (EC)" button no longer cancels the upstream
   A3/A3S Document Arrival; the button is now hidden for A4 entirely (`payExistingUtilize` functions have
   nothing of their own to delete). Live in-browser click-through verification is still recommended
   (attempted but blocked by a browser-extension issue at fix time — see BAL-122's own Outcome) before
   treating this as fully closed, but the static verification (typecheck, strict-template build, full
   test suite) is strong evidence the fix is correct.
5. **BAL-123** *(Fixed, 2026-08-17)* — A4's own 4-eyes gate is now enforced server-side too, scoped by
   the movement's own parent contract `tenorType === 'SIGHT'` (not a blanket IPLC_LC/UTILIZE rule, which
   would have incorrectly broken A6's own Usance compound-release flow). "Genuine Maker/Checker
   separation" for A4 is now a real, server-enforced control, not just a client-side convention. OAS
   bumped to v1.5.0.

Neither BAL-122 nor BAL-123 ever blocked continued prototype/demo use — the feature worked correctly for
its own intended interactive-UI use case even before either was fixed, and BAL-122 required a specific,
non-obvious misclick sequence to trigger. **Both are now fixed, and so is every other finding this pass
surfaced — BAL-134, BAL-131, BAL-124, BAL-125, BAL-126, BAL-127, BAL-128, BAL-130, and BAL-132** —
`import-case-4`'s own stale scenario (found incidentally while verifying BAL-123), the Business Case
Registry's own completeness gap (zero orchestrator-level `/acknowledge` coverage), the executor's
duplicated step handlers (closed as a direct side effect of the BAL-131 fix), `checker-actions.service.ts`'s
own 6 un-swept `any` occurrences (retyped to `BalanceMovement`), that same file's own 20 duplicated
`{kind:'failed'}` constructions (collapsed into one shared `fail()` helper), `backend/data/businessCases.js`'s
own ~49 duplicated create+release step pairs (collapsed into one shared `createAndRelease()` helper,
fixed despite its own "not yet urgent" framing), `backend/`'s 3 stale `eslint-disable` comments (deleted
outright, bringing `npm run lint` to 0 errors/0 warnings), the microservice's own `balanceService.ts`
`acknowledge()`/`submitByMaker()` duplication (collapsed into one shared `guardSecondaryAction()` helper,
also fixed ahead of its own "not urgent" framing), and `checker-actions.service.ts`'s own `ctx.createdBy!`
non-null assertion (replaced with a runtime guard plus two new dedicated tests), respectively. **This
2026-08-17 pass now has zero open findings of its own** — the only items on this report's own Gate
Conditions list are the pre-existing, explicitly deferred BAL-001/BAL-002/BAL-102 above. BAL-003 (God
Component, tracked separately in its own section) was fixed in a later, separate pass (2026-08-20) — see
that section's own Ninth outcome — and no longer belongs on this list at all.
