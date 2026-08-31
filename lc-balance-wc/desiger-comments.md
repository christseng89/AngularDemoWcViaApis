# Balance Component — OOD Review

An independent, read-only review of `lc-balance-wc` (the Angular Transaction Builder, the
Node.js/TypeScript microservice, and the backend orchestrator), assessed against SOLID and the
classic GoF pattern vocabulary. Every finding below was verified by reading the current source
directly (file and line cited) — not by summarizing what `CLAUDE.md`'s own decision log or
`Quality-report-balance.md` already claim about the codebase. Where this review confirms something
those documents already say, it says so briefly; where it found something they miss, understate, or
get right that a reflexive pass would flag as wrong, it says that instead.

**Scope**: `src/app/transaction-builder`, `microservices/balance-component/src`, `backend`.

---

## Verdict

This codebase is more self-aware than most — nine prior extraction passes on the Angular side have
genuinely improved it, and several of its design choices (a functional domain core, a table-driven
status machine, a real repository boundary) are correct calls that a less careful team would have
gotten wrong. The debt that remains is concentrated in one place: **the 14-function business
registry is a Strategy pattern in name only**. Its own behavior is scattered as boolean flags
re-interpreted independently across five files, on both sides of the HTTP boundary. That single gap
is the traceable root cause of several bugs this session already had to hunt down by hand.

Nothing here is an emergency. But one refactor — giving each named function its own behavior instead
of a flag bag five other classes have to reinterpret — would remove more future bug classes than any
other change on this list.

**Summary**: 3 High priority · 6 Medium priority · 4 Low priority · 7 confirmed strengths.

---

## What's genuinely working

A credible review names what's earning its keep, not just what isn't. These held up under direct
reading, not just the codebase's own account of itself.

- **A Decorator that's actually a Decorator** — `builder-fields.ts` · `toReadOnlyFields()` wraps live
  Formly field output (forcing `disabled`, stripping `expressions`) without touching the function it
  wraps. Genuinely reused by two independent call sites, not a one-off.
- **One small class, reused honestly** — `paged-list-state.ts`: page/total/boundary math extracted
  once, reused three times (`CatalogPickerService`, two Event Timeline paginators). This is what a
  correctly-scoped extraction looks like elsewhere in this review.
- **An Adapter with a real reason to exist** — `inquire-events.service.ts` · `InquiredEvent` pairs a
  bare movement with the contract that owns it, because the movement alone can't answer "what
  instrument, what natural key." Not a rename wearing a pattern's name.
- **Anemic — and correctly so** — `domain/*.ts` is pure functions over plain data, textbook "anemic
  model." For money-moving, audit-critical rules that need independent, side-effect-free testability,
  that's the right call, not a shortcut. Flagged here so it isn't mistaken for debt.
- **A state machine that stayed a table** — `domain/statusTransition.ts`: legal transitions live in
  one typed lookup table. Adding a status is a data change, not new code. A full State-pattern class
  hierarchy here would have been over-engineering; this is the right weight.
- **Inheritance, used where it's earned** — `errors.ts` · `ApiError`: a small, closed, fixed-shape
  error hierarchy is one of the only places in the codebase using real OOP inheritance, and it's
  exactly the case where that's the right tool.
- **A clean Repository boundary** — `store/balanceContractStore.ts`, `balanceMovementStore.ts`: typed
  find/list/insert methods, zero leaked row shapes into the service layer. The one clear repository
  boundary in the codebase.

---

## High priority

Live sources of defects or structural risk — worth scheduling, not just noting.

### F-01 — The 14-function registry is a Strategy pattern in name only

`balance-component.model.ts` · `TransactionFunction` carries 11 boolean flags
(`payExistingUtilize`, `settlesDocumentArrival`, `deferSettlement`, `autoRedeemType`, …) that get read
and re-interpreted independently in **54 separate places across five files** on both sides of the
HTTP boundary. A real Strategy puts behavior on the strategy object; this makes every consumer
reconstruct that behavior itself from a flag reading.

This isn't hypothetical debt — it's the traceable root cause behind more than one bug already chased
down by hand this session (the A4/tenor-type interaction, the B3-vs-B4 movement-correlation bug).
Adding one new compound function today means finding and editing up to five files, each re-deriving
the same branching independently.

*SOLID · OCP — GoF · Strategy*

### F-02 — The microservice has its own uncredited God Method

`service/balanceService.ts` · `createMovement()` runs roughly 300 lines: the re-Issue guard, the
root-Issue-released guard, and a distinct per-instrument sufficiency check (SHGT vs. parent Tight
Available, Acceptance tenor consistency, Present-Docs earmark) all as sequential inline `if` blocks.
`release()` repeats the shape at smaller scale.

The Angular side's God Component got nine remediation passes. This method — arguably the most
consequential single function in the whole system, since it's the one place every movement's
legality is decided — has never been named in any prior review.

*SOLID · SRP, OCP*

### F-03 — TransactionBuilderComponent is still the seam everything gets bolted to

`transaction-builder.component.ts` (2,288 lines) — after nine extraction passes, it still directly
owns six near-identical load/select/paginate subsystems (the flat Catalog, Parent-LC, and IB-Index
pickers; `sgsForArrival`; `payableMovements`; `settleableBalances`), dialog state, Checker-queue
search, and status formatting. It grew by 264 lines again this session alone.

*SOLID · SRP*

---

## Medium priority

Real gaps, none urgent on their own — several share a root cause with the High findings above.

### F-04 — Three incompatible ways of constructing a dependency, in one constructor *(Med-High)*

`transaction-builder.component.ts:367–380` — `api` is real Angular DI; `checkerActions`/`makerSubmit`
use a default-parameter fallback (`= new CheckerActionsService(api)`) specifically so ~70 existing
tests didn't need touching; five other services are manually `new`'d in the constructor body with no
DI at all. The default-parameter pattern silently stops working the moment either service needs a
second real dependency — and none of the five body-constructed services can be substituted in a test
without reaching into `comp.xxx.yyy` directly.

*SOLID · DIP*

### F-05 — The same gap as F-01, restated on the server

The microservice has no equivalent table for movement-type-specific behavior at all — every branch in
`balanceService.ts` is a hand-written `if`, with no shared vocabulary against the Angular-side
registry. The same business rule (which movement types are legal, what they require) can drift
independently on either side of the boundary with nothing to catch it.

*SOLID · OCP*

### F-06 — `BalanceContract`/`BalanceMovement` are hand-duplicated across the wire boundary

`balance-component-api.service.ts` vs. `types.ts` — both sides' own comments admit these are "kept in
sync by hand." This has already caused one real, confirmed gap (`balanceBefore`/`balanceAfter`
silently missing from the Angular interface until a stricter pass caught it). Ten-plus fields were
added to this shape this session alone; there's no shared-schema mechanism to stop the next one
drifting unnoticed.

*DRY*

### F-07 — Testability was retrofitted, not designed in

Forty-plus tests across this codebase read component/service fields directly by name rather than
through any substitutable seam — which is exactly why every extraction pass on record had to preserve
field names and shapes precisely, and why a genuinely cleaner child-component refactor was
investigated and declined more than once. This is the root cause behind F-04; it isn't cheap to fix
now, but it's worth naming as the reason several "we looked at this and backed off" decisions exist.

*SOLID · DIP*

### F-08 — One field carries the whole Maker flow with no compile-time contract

`transaction-builder.component.ts:279` · `submitResult: any` drives whether the form locks, whether
the Account Entries dialog can open, and the Checker hand-off — with zero type safety, in a codebase
that's otherwise strict about `BalanceMovement` typing everywhere else. Already disclosed once as a
deliberate, scoped trade-off to avoid rewriting ~15 test fixtures; confirmed still open.

*Type safety*

### F-09 — `CatalogPickerService` can't be reused for a read-only browse

`catalog-picker.service.ts:65–98` hardcodes `status: 'ACTIVE'` and `requireIssueReleased: true` —
correct for the three Maker-action pickers it serves, wrong for an inquiry. Confirmed first-hand: the
LC Master Records Index couldn't reuse this class and hand-wrote a parallel fetch/paginate
implementation instead. A single filter-override parameter would let it extend cleanly rather than
being bypassed — the class's own comment already names this tension without resolving it.

*SOLID · OCP*

---

## Low priority

Worth a note, not worth interrupting anything for.

### F-10 — `runCase()`'s step dispatch is still a plain if-chain

`backend/server.js` · `runCase()` — five step types (note, createMovement, the release-shaped trio,
snapshot), dispatched sequentially. Proportionate at this scale; worth revisiting only if the step
vocabulary keeps growing at its current per-session rate.

*GoF · Command*

### F-11 — businessCases.js has no separation between case data and case construction

`backend/data/businessCases.js` (1,490 lines, 14 cases) — every compound case still hand-writes its
own step array inline beyond the one shared `createAndRelease()` helper. A reasonable quality bar for
fixture data, not application logic; only worth revisiting if growth continues at its current pace.

*GoF · Builder*

### F-12 — Error handling is asymmetric across the boundary — defensibly so

The microservice owns a real typed `ApiError` hierarchy (see Strengths, above); the Angular client
just extracts a display string from whatever comes back. That's the correct division of
responsibility, not a gap — the client only ever needs to show *some* human-readable message, and a
mirrored typed hierarchy there would add ceremony without adding safety. Noted so it isn't mistaken
for an oversight.

*Reviewed · no action*

### F-13 — RELEASE_SHAPED_STEP_TYPES is correctly small

`backend/server.js:59` — a genuinely well-executed table consolidating `release`/`makerSubmit`/
`acknowledge`'s identical shape. Listed here rather than as a Strength only because a full Command
class hierarchy for three near-identical variants would itself have been the wrong call — this is the
right amount of structure, not less than ideal.

*GoF · Strategy*

---

## Recommended sequence

In the order that actually pays down risk fastest — each step makes the next one cheaper, not just
shorter.

1. **Give each named function real behavior, not flags to reinterpret (F-01).** Turn the 11-flag
   registry into small per-function strategy objects (even just `buildRequest()`/`describesRelease()`
   methods) that the five current consumers call instead of branching on. This is the one change that
   shrinks F-03 and F-05 as a side effect, not just its own line item.
2. **Split `createMovement()` by concern before it grows a 15th instrument type (F-02).** Extract
   each per-instrument sufficiency check into its own named function under `domain/`, matching the
   pattern already proven in `shgtRedeem.ts`/`amendDecrease.ts`. Low risk — this codebase's own
   domain layer already shows the target shape.
3. **Pick one dependency-construction strategy and standardize on it (F-04).** Doesn't require the
   F-07 test rewrite to start — new services added from here forward should get real constructor
   injection, closing the gap incrementally rather than in one disruptive pass.
4. **Add a filter-override to `CatalogPickerService` (F-09).** Small, contained, and removes the one
   place this session had to hand-roll a parallel implementation instead of reusing an existing one.
5. **Everything else on this list can wait for a natural touch-point.** F-06, F-08, F-10–13 are each
   cheap to fix the next time you're already in that file for an unrelated reason — none earns its own
   dedicated pass right now.
