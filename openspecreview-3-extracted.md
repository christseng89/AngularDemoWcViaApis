# OpenSpec Review — lc-balance-wc (Balance Component)

**Reviewer scope:** openspec/ directory (config.yaml, specs/, changes/),
cross-checked against the official
[<u>OpenSpec</u>](https://openspec.dev/) framework conventions and
against the actual TypeScript/Angular source in the repository.

**Overall score: 9.3 / 10 — Excellent, professional-grade adoption.**
(raised from 9.2 in §10, after the changes/ gaps flagged in §9 were
fixed)

This is one of the more disciplined OpenSpec setups I've reviewed: every
sampled requirement matched the real implementation precisely, including
subtle formulas and edge-case wording, and the project has clearly
internalized *why* OpenSpec exists (AS-IS truth vs. proposed change)
rather than just its file layout.

## 1. Method

1.  Read every file under openspec/ (14 capability specs, 1 active
    change with proposal/design/tasks/delta-spec, config.yaml,
    .openspec.yaml).

2.  Pulled the official OpenSpec conventions from
    [<u>openspec.dev</u>](https://openspec.dev/) and the
    [<u>Fission-AI/OpenSpec</u>](https://github.com/Fission-AI/OpenSpec)
    GitHub repo (concepts, config.yaml reference, CLI reference,
    schema/customization docs, and the raw spec-driven template) to
    check this project's structure against the current upstream standard
    rather than assumption.

3.  Cross-referenced a representative sample of spec **Requirements**
    against the actual source in
    microservices/balance-component/src/\*\* and backend/\*\* on your
    machine (via the connected lc-balance-wc folder), spanning 9 of the
    14 capability specs.

4.  Attempted to run openspec validate --all --strict --no-interactive
    directly — the npm package name resolution failed in this sandboxed
    shell (openspec on the public registry is an unrelated placeholder,
    not the Fission-AI CLI, and network egress here is restricted), so
    this review is a **manual/sampled** verification, not a substitute
    for you running the real CLI locally. See §6.

## 2. Structural & convention compliance — **strong match to upstream**

| **Convention (per openspec.dev / GitHub)** | **This project** | **Verdict** |
|:---|:---|:---|
| openspec/specs/, openspec/changes/, openspec/changes/archive/ | Present, exactly | ✅ |
| openspec/config.yaml with schema, context, rules, operations fields | Present with all four, no invented fields | ✅ matches official schema field-for-field |
| Per-change .openspec.yaml with schema + created | configuration-first-product-extension/.openspec.yaml has both | ✅ |
| Change folder: proposal.md, design.md, tasks.md, specs/\<capability\>/spec.md | All present, dependency order (proposal → design/specs → tasks) respected | ✅ |
| Delta spec header format \## ADDED Requirements / \### Requirement: X / \#### Scenario: Y | Followed exactly | ✅ |
| Scenario body format - \*\*WHEN\*\* … / - \*\*THEN\*\* … (the *actual* upstream template has no GIVEN line — I verified this against the raw schemas/spec-driven/templates/spec.md in the GitHub repo, not just prose docs) | Followed exactly, consistently across all 14 specs | ✅ |
| SHALL/MUST normative language | Used consistently; I did not find a stray "should/may" masquerading as a hard requirement | ✅ |
| kebab-case change IDs, capability names | configuration-first-product-extension, account-mapping-configuration, etc. | ✅ |
| Archive folder empty except .gitkeep | Consistent with "no change has been archived yet" — not a defect, just unproven | ⚠️ untested |

One thing worth flagging as **not actually a defect**: config.yaml
(rather than a project.md) is the correct, current OpenSpec convention —
I initially expected project.md from older write-ups, but the live docs
confirm openspec/config.yaml (with schema/context/rules/operations) is
the primary project-configuration mechanism. Your file matches the
official example nearly verbatim in shape. Good instinct not to invent
your own format here.

## 3. Source-code fidelity — the standout strength

Your config.yaml states specs must describe only "已經由 Source
Code、自動化測試及 OAS 證實的可觀察 AS-IS 行為" (observable AS-IS
behavior, evidenced by code/tests/OAS). I tested that claim directly.
Sample of what I verified line-by-line against the real implementation:

| **Spec claim** | **Source evidence** | **Result** |
|:---|:---|:---|
| Amounts use exact decimal math, ROUND_HALF_UP per currency | money.ts:30 — Decimal.ROUND_HALF_UP, decimal.js import | ✅ exact match |
| Shorthand accepts h/k/m, rejects t; 3h2h→500; 1k.25→1000.25 | amount-shorthand.ts regex \[hHkKmM\] (no t), BigInt scale arithmetic traced by hand to both example outputs | ✅ exact match |
| A1/B1 tolerancePct must be non-negative **integer**; Amendment toleranceChangePct same, with required direction; Release recomputes rather than trusting caller | movementRequestValidator.ts:150-189 (assertToleranceNonNegative, assertToleranceChangeAllowed) | ✅ exact match, including the "Amendment SHALL NOT accept a final tolerancePct" rule |
| Confirmed Balance = Σ RELEASED; Available = Confirmed ± Σ PENDING, **excluding AMEND_EXPIRY_DATE** | balanceDerivation.ts:computeConfirmedBalance / computeAvailableBalance | ✅ exact match |
| Sufficiency floor: negative intermediate capacity is treated as zero | offBalanceExposure.ts:13-15 comment: "Trade Finance capacity is never exposed below zero" | ✅ exact match |
| Maker/Checker: same user cannot Release or Reject their own movement | statusTransition.ts:assertMakerCheckerSeparation (business-confirmed 2026-08-24) | ✅ exact match |
| EARMARKING/EARMARKED memo vouchers stay visible even though accountEntries stays null | contingentAccountEntry.ts:23-24 | ✅ exact match |
| Account Mapping Reload writes with actor SYSTEM_CONFIG_RELOAD | balanceAccountMappingService.ts:82 | ✅ exact match |
| A11/B7 restoration amount is server-derived from the trailing EXPIRE/CLOSE write-off chain, never Maker-typed | reopenRestoration.ts:computeReopenRestoreAmount (walks backward summing consecutive RELEASED EXPIRE/CLOSE) | ✅ exact match, and the code's own rationale is *more* precise than the spec's summary |
| Web Component has versioned config rejection, System/Light/Dark themes, Angular **and** React **and** Vue adapters, a release verifier | src/adapters/{angular,react,vue}/, src/app/web-component/web-component-release.contract.spec.ts, docs/web-component-contract.md all present | ✅ exact match — nothing here is aspirational |
| Business Case Runner retains one manual-test prerequisite each for A4, A6, B4 | backend/data/businessCases.js:3045-3195 — "retain for manual A4/A6/B4" | ✅ exact match |
| HTTP 500s return a structured {code, message} body, no stack/SQL leakage | app.ts:80 — generic handler returns only INTERNAL_ERROR | ✅ exact match |
| The proposed configuration-first-product-extension change (Generic Balance Engine, BalanceAction, TAKE_DOWN/REPAYMENT/etc.) is correctly *not yet implemented* | grep -r "BalanceAction\|TAKE_DOWN\|RELEASE_EARMARK\|CONSUME_EARMARK" across src/ and microservices/ → **zero matches** | ✅ confirms the proposal is honestly scoped as future work, not smuggled into specs/ as if already true |

Every one of these checks passed. I did not find a single case of a spec
asserting behavior the code doesn't have, or vice versa, in the sample I
pulled. That's a genuinely high bar — most "spec-driven" repos I see
have at least a few stale claims.

**One completeness gap** (not a correctness error):
maker-checker-control's "Maker 與 Checker 分離" requirement text only
names Release/Reject, but assertMakerCheckerSeparation() in code is also
called for ACKNOWLEDGE (A3 acknowledgement) — same rule, same code path,
undocumented in the spec's requirement text. Cheap fix: add "或
Acknowledge" to the requirement and a third scenario.

## 4. Requirement & Scenario quality — good, with one recurring pattern worth fixing

Your own config.yaml rule says: *"每項 Requirement 至少要有一個可測試的
WHEN／THEN Scenario；適用時必須加入拒絕或邊界情境"* (add a
rejection/boundary scenario when applicable).

In practice, almost every transaction Requirement (A1–A11, B1–B7, and
most of the supporting specs) carries **exactly one** scenario — never
both a positive and a rejection/boundary case in the same Requirement.
The single scenario is sometimes the happy path (A1, A4, A7, A9, A10,
A11, B1, B4, B5, B7 …) and sometimes the boundary case (B2 "Decrease
超過 Tolerance", B6 "未消耗 B3 阻止 Close") — but never both together. A
few requirements do get it right with two scenarios
(tolerance-and-money's "金額縮寫輸入", "Amendment Tolerance Change";
http-api-and-inquiry's "Empty State 與錯誤分離"), which shows the team
knows how to do it — it's just inconsistently applied.

This isn't a fidelity problem (the rejection paths mostly *do* exist in
code and in generic cross-cutting specs like tolerance-and-money or
http-api-and-inquiry's "無效 Request"), but it does mean a reader can't
tell a single transaction's full contract — success *and* failure — from
its own Requirement block; they have to cross-reference 2–3 spec files.
For a domain this state/money-sensitive, I'd treat this as the single
highest-value improvement:

**Recommendation:** For each A-series/B-series transaction Requirement
that doesn't already have one, add a second \#### Scenario covering the
transaction's own primary rejection/eligibility-failure case (e.g., A8
exceeding Tight Available, A9/A10 on an ineligible SG/LC, A11 on a
non-CLOSED contract). This is exactly what your own config.yaml rule
already asks for — it's an enforcement gap, not a missing rule.

## 5. Change-management process (configuration-first-product-extension)

This is a well-formed change proposal:

- proposal.md covers Why / What Changes / Capabilities (new vs.
  modified) / Impact — including rollback and non-goals, as your
  rules.proposal requires.

- design.md covers Context, Goals/Non-Goals, Decisions, data flow,
  migration/rollback, security/reliability, risks, and an explicit
  decision log (adopted vs. rejected alternatives) — this exceeds the
  minimum template and is genuinely good architecture-decision-record
  practice.

- tasks.md is hierarchically numbered, test-first ("為目前每個
  A1–A11、B1–B7 可觀察流程加入 failing Characterization Tests" before
  any routing change), and ends with the exact strict-validation gate
  (openspec validate --all --strict --no-interactive) your config.yaml
  names.

- The delta spec (specs/product-definition-configuration/spec.md) is \##
  ADDED Requirements only, matching proposal.md's own "Modified
  Capabilities: 無" — internally consistent.

- Crucially, as verified in §3, none of this proposed architecture has
  leaked into specs/ as if already real. That discipline is the entire
  point of OpenSpec's AS-IS/changes split, and you're actually following
  it.

## 6. Minor issues / nits

1.  **Couldn't run the real openspec validate --all --strict
    --no-interactive here** — the sandboxed shell's npx openspec
    resolves to an unrelated placeholder package (openspec@0.0.0 on the
    public npm registry, not Fission-AI's CLI), and I didn't want to
    fight network/tooling issues on your machine without asking first.
    **Please run the strict validator yourself** (you already have it
    working locally per CLAUDE.md) — it will catch any structural issue
    (duplicate requirement names, missing scenarios, header mismatches)
    far more exhaustively than my sampled read.

2.  **Traditional vs. Simplified Chinese split**: openspec/\*\*
    (config.yaml, all specs, the change) is written in Traditional
    Chinese (繁體), while the governing root CLAUDE.md — including the
    section that directly legislates OpenSpec usage — is Simplified
    Chinese (简体). Possibly intentional (e.g., spec artifacts for a
    Taiwan-based business audience vs. an engineering-facing doc), but
    worth confirming it's a deliberate choice rather than drift, since
    CLAUDE.md is supposed to be the closest governing document to these
    files.

3.  **Authority ordering is a deliberate customization worth knowing
    about**: CLAUDE.md ranks openspec/specs/ *below* analysis/ and the
    OAS files, and *above* tests/implementation, in its
    conflict-resolution order. That's a legitimate project choice
    (treating OpenSpec as an audited-behavior mirror rather than the
    top-of-stack authority), but it's a deviation from OpenSpec's usual
    framing of specs/ as *the* source of truth — just make sure everyone
    on the team knows openspec/specs/ is not where a disagreement gets
    resolved first.

4.  **changes/archive/ is empty** — fine at this stage, but the archive
    discipline (merge deltas into specs/, verify item-by-item against
    implementation, date-prefix the folder) is untested by this repo so
    far. Worth watching the first archive closely.

## 7. Score breakdown

| **Dimension** | **Score** | **Notes** |
|:---|---:|:---|
| Structural/convention compliance vs. upstream OpenSpec | 9.5 / 10 | Matches the current official schema almost exactly |
| Requirement & Scenario quality | 8.5 / 10 | Consistent SHALL/MUST + WHEN/THEN; recurring single-scenario-per-requirement pattern (§4) |
| Source-code fidelity (AS-IS accuracy) | 9.7 / 10 | Every sampled requirement verified correct against real code, including subtle formulas |
| Change-management process | 9.7 / 10 *(was 9.3, see §10)* | Strong proposal/design/tasks discipline; future work correctly kept out of specs/; service boundaries, OOD trade-offs, and evidence citation added and verified in §9–§10 |
| Documentation ecosystem integration | 9.0 / 10 | Well cross-referenced with analysis/, docs/obsidian-\*, source paths in every spec's "來源追蹤" section; minor language-consistency nit |
| **Overall** | **9.3 / 10** *(was 9.2, see §10)* |  |

**Remaining open actions, in priority order (see §10 — item 5 from the
prior list is now done):**

1.  Run openspec validate --all --strict --no-interactive locally and
    fix whatever it flags — treat this review as a complement to that,
    not a replacement.

2.  Add a rejection/boundary \#### Scenario to the A/B-series
    transaction Requirements that currently only show the happy path
    (§4).

3.  Add "Acknowledge" to maker-checker-control's separation requirement
    text to match what the code already enforces (§3).

4.  Pin/document the openspec CLI version (§8) so /opsx:\* and the
    openspec-\* skills work reproducibly for every contributor and in
    CI.

5.  ~~In configuration-first-product-extension/design.md, add a Service
    Boundaries note and name the OOD trade-offs~~ — **done**, see §10.

## 8. Re-check pass (second review)

You asked me to check again. I re-read the same openspec/ content plus
the freshly-surfaced project CLAUDE.md (no new contradictions with
what's already in §1–§7), then went further: I inspected the project's
actual OpenSpec *tooling* (.claude/commands/opsx/\*.md,
.claude/skills/openspec-\*/SKILL.md) rather than only the generic
upstream docs, and ran a second, independent batch of source-code
spot-checks. Net effect: **the 9.2/10 score stands**, and I found one
additional, concrete infrastructure gap plus several more confirmations.

### 8.1 New finding: the openspec CLI itself isn't reproducibly available

CLAUDE.md names openspec validate --all --strict --no-interactive as
*the* strict-validation command, and the repo's
.claude/commands/opsx/{propose,apply,archive,explore,sync,update}.md and
.claude/skills/openspec-\*/SKILL.md are all real wrappers around live
openspec CLI calls (openspec new change, openspec status --json,
openspec instructions, openspec validate --specs, etc. — not something
these skills fake internally). Those skill files even carry generatedBy:
"1.12.0", confirming the CLI was used at least once to scaffold them.

But on the machine backing this workspace right now:

- which openspec → not found

- no openspec entry in package.json or package-lock.json

- no node_modules/.bin/openspec

- no global npm install under the active npm prefix

- README.md doesn't document how/where to install it

So the strict-validation command your own governance document treats as
load-bearing has no recorded, reproducible install path in the repo — it
only works if whoever runs it happens to already have openspec (ideally
the same 1.12.0-compatible version) on their machine. For a fresh clone,
a new contributor, or CI, /opsx:\* and every openspec-\* skill would
currently fail at the first openspec ... call. This doesn't affect the
*content* quality I already reviewed, but it's a real gap in the
"validation must actually run" half of your OpenSpec Professional
Verification Gate. Suggested fix: add openspec as a pinned devDependency
(or document the exact global-install command/version in
README.md/CLAUDE.md) so openspec validate --all --strict
--no-interactive is runnable by anyone, not just whoever's machine still
has it from setup.

### 8.2 Additional source-code confirmations (second sample, no contradictions found)

| **Spec claim** | **Source evidence** | **Result** |
|:---|:---|:---|
| A4/A6/B4 Amount is carried from the picked Arrival and shown read-only/"protected" | builder-fields.ts:217 → 'Amount (carried from the Document Arrival, protected)'; asserted for A4/A6/B4 in builder-fields.spec.ts:925-929 | ✅ exact match |
| Movement idempotency keyed on contract + Event Seq | balanceMovementStore.ts:144 — "idempotent on (balanceContractId, eventSeq)" | ✅ exact match |
| Auto Close runs after a **configured** business-day grace period (spec deliberately doesn't hardcode the number) | config.ts:79 — AUTO_CLOSE_GRACE_PERIOD_BUSINESS_DAYS = 2 | ✅ match, and the spec's choice not to hardcode "2" in prose is good practice — it won't go stale if the config value changes |
| Checker actions that complete multiple legs commit atomically in one transaction | service/unitOfWork.ts — SqliteUnitOfWork.execute() wraps BEGIN IMMEDIATE / COMMIT / ROLLBACK around the whole operation | ✅ exact match |

### 8.3 What I re-verified but did not need to change

- The delta-spec operation set (ADDED/MODIFIED/REMOVED/RENAMED
  Requirements) and the "MODIFIED must carry every surviving scenario,
  not just the diff" rule, straight from openspec-sync-specs/SKILL.md —
  the project's own configuration-first-product-extension change uses
  only ADDED Requirements (consistent with its proposal.md stating
  "Modified Capabilities: 無"), so this rule isn't exercised yet but
  nothing in the repo violates it.

- openspec/config.yaml's field set against the CLI-level openspec
  instructions/openspec status flow described in these skills — still a
  clean match, no invented fields.

- My §4 scenario-coverage finding and §3 ACKNOWLEDGE-omission finding
  both still hold on this second pass; I didn't find evidence to soften
  or retract either.

**Revised score: still 9.2 / 10.** The content of your specs remains
excellent and code-accurate; the new finding is about the surrounding
tooling's reproducibility, not about anything you wrote in openspec/
itself.

## 9. Third pass — focused on openspec/changes/ only

You asked me to check again with attention on **Changes**.
openspec/changes/ still holds exactly one active change,
configuration-first-product-extension (file sizes/mtimes unchanged since
§1–§8, so nothing has moved since the last pass), plus an empty
archive/. This pass re-reads proposal.md, design.md, tasks.md,
.openspec.yaml, and the delta spec against each other (internal
consistency) and against the repo, rather than against the other 14 main
specs.

### 9.1 Checked and cleared: the "Characterization" claim is grounded, not aspirational

proposal.md states, under "Modified Capabilities: 無": *既有 Import LC
與 Export Confirmed 行為已由 Characterization 固定* ("existing behavior
has already been pinned by Characterization"). Read in isolation, that's
in tension with tasks.md task **1.1**, which is an *unchecked* box
asking to "為目前每個 A1–A11、B1–B7 可觀察流程加入 **failing**
Characterization Tests" — i.e., the formal test suite doesn't exist yet.
I checked whether the proposal's claim was simply unsupported:

- grep -r "haracterization" across microservices/balance-component/test,
  src, and backend → **zero matches**. No file anywhere in the repo is
  literally labeled a Characterization Test.

- But REGRESSION-BASELINE.md (repo root, dated 2026-08-19, pinned to a
  specific commit) *is* a real, dated, evidence-backed baseline: 821/821
  Angular tests, 322/322 microservice tests, 34/34 backend tests, all
  three above their coverage floors, **plus all 14 registered Business
  Cases run live end-to-end against the real services** (A1→A2→A3→A4/A6,
  A3S SG-netting, B1→B3→B4→B5, etc.), with before/after byte-for-byte
  verification on the reference contract rows.

So the proposal's claim is **substantively true** — there is a real,
dated artifact pinning current AS-IS behavior — just not literally the
thing task 1.1 asks for. tasks.md is correctly asking for something
*stricter*: an automated, routing-change-blocking, failing-first test
suite, one level more rigorous than a manually-reproduced regression
baseline document. That's good sequencing, not a contradiction. The one
improvement I'd make: have proposal.md cite REGRESSION-BASELINE.md by
name as its evidence for that sentence, so a reader doesn't have to go
hunting (as I just did) to tell whether "already fixed by
Characterization" is a factual claim or a forward-looking intention.

### 9.2 New finding: design.md doesn't explicitly cover two things its own config.yaml rule requires

config.yaml's rules.design says design docs
"必須識別服務邊界、資料流、交易邊界、失敗行為、安全控制及
OOP／OOD／SOLID 取捨" (must identify service boundaries, data flow,
transaction boundaries, failure behavior, security controls, **and
OOP/OOD/SOLID trade-offs**). Checking design.md against that six-item
list:

| **Required element** | **Present in design.md?** |
|:---|:---|
| 資料流 (data flow) | ✅ explicit \## 資料流 section |
| 交易邊界 (transaction boundaries) | ✅ "Multi-leg Action 失敗時必須原子回滾" under 安全與可靠性 |
| 失敗行為 (failure behavior) | ✅ 遷移與回復 + 安全與可靠性 ("寧可 Startup Failure，也不得提供部分有效的 Product Catalog") |
| 安全控制 (security controls) | ✅ 安全與可靠性 section |
| 服務邊界 (service/module boundaries) | ⚠️ only implied (Goals/Non-Goals gesture at scope) — no explicit statement of which service/module owns Product Definition loading, validation, or the policy registry |
| OOP／OOD／SOLID 取捨 (OOP/OOD/SOLID trade-offs) | ⚠️ implicit only — "Typed Policy Registry" (narrow interfaces the config can select but not inject code into) is a Strategy-pattern / dependency-inversion decision in substance, but the doc never names it as such or discusses alternative OOD shapes considered and rejected at the class/interface level (the "決策紀錄" section is architecture-level: config-driven vs. switches vs. untyped rules — not OOD-level) |

This is a real, if minor, self-consistency gap: not against the upstream
OpenSpec framework, but against a rule this project's own config.yaml
wrote for itself. Since design.md is otherwise unusually thorough (data
flow, rollback, decision log with rejected alternatives), this is a
cheap fix — a short "Service Boundaries" note and a paragraph naming the
OOD pattern (Strategy/Registry, dependency inversion at the
policy-plugin boundary) and why a simpler shape (e.g.,
inheritance-per-product) was rejected, would close the gap.

### 9.3 Other change-internal checks — all clean

- Capability path consistency: proposal.md's "New Capabilities:
  product-definition-configuration" matches the delta spec's actual path
  specs/product-definition-configuration/spec.md exactly.

- proposal.md's "Modified Capabilities: 無" is consistent with the delta
  spec containing only \## ADDED Requirements (no
  MODIFIED/REMOVED/RENAMED sections) — internally consistent.

- No duplicate \### Requirement: names within the delta spec (8
  requirements, 8 distinct titles).

- .openspec.yaml (schema: spec-driven, created: 2026-09-04) has only the
  fields it needs — no skip_specs/retire_capabilities clutter,
  correctly, since this change does write a specs delta and doesn't
  retire anything.

- tasks.md's six task groups map cleanly onto design.md's decisions and
  the delta spec's requirements (1↔Backward-compatible
  Migration/Characterization; 2↔Typed Policy Registry; 3↔Generic Balance
  Engine/Accounting; 4↔Shared Consumer Model; 5↔遷移與回復's 6-step
  plan; 6↔Product Acceptance 證據) — no orphaned task group and no
  requirement without a corresponding task.

- Minor terminology drift, not a defect: design.md's 遷移與回復 numbered
  plan talks about "Feature Flag 或 Registry Selection," while its own
  決策紀錄 talks about "Rollback Adapters," and tasks.md 5.1 says "在
  Adapter 後方遷移" — three related-but-not-identical terms for what's
  likely one mechanism. Worth picking one term and using it consistently
  across the file.

**Score unchanged at 9.2 / 10.** This third pass didn't surface anything
that would move the number — the one genuinely new, actionable item is
§9.2 (design.md's missing service-boundary/OOD discussion against the
project's own rule); §9.1 turned out to be a non-issue once traced to
REGRESSION-BASELINE.md, and §9.3 confirms the change's internal wiring
(proposal ↔ design ↔ tasks ↔ delta spec) is sound.

## 10. Fourth pass — verifying the fixes (score raised to 9.3 / 10)

You asked to re-check changes/ again. proposal.md (2599→2771 bytes),
design.md (4489→7074 bytes), and tasks.md (2160→2214 bytes) all changed
since §9; the delta spec did not. I re-read all three in full and
checked them against every item §9 raised.

**§9.1 (Characterization citation) — fixed exactly as suggested.**
proposal.md's "Modified Capabilities" now reads: "既有 Import LC 與
Export Confirmed 行為已有 repository root REGRESSION-BASELINE.md
的日期化回歸證據；本 Change 的 task 1.1
將再把每個流程提升為可自動執行、failing-first 的 Characterization
Tests。" This names the evidence file directly and correctly frames task
1.1 as raising the bar, not filling a void — no more ambiguity for a
reader.

**§9.2 (service boundaries + OOD/SOLID) — fixed, and done well, not just
checked off.** design.md gained two new sections:

- **\## Service Boundaries**: seven explicit boundaries (Product
  Definition Provider, Typed Policy Registry, Application/Transaction
  Service, Generic Balance Engine, Accounting/Account Mapping,
  Angular/API Discovery Consumers, Stores/Database), each stated as what
  it owns *and* what it explicitly does not do (e.g., "Generic Balance
  Engine 只處理 BalanceAction\[\]...它不認識 A1–A11、B1–B7
  或未來產品的畫面流程"; "Database 不承擔可執行 rules-engine 職責").
  That's a stronger form than I asked for — boundaries stated as both a
  grant and a denial read much better as enforceable constraints than a
  grant alone.

- **\## OOP／OOD／SOLID 取捨**: names the pattern (Strategy + Registry +
  Adapter), ties each SOLID letter to a concrete consequence in this
  design (Dependency Inversion at the Application Service/Engine
  boundary, Open/Closed via new definitions instead of engine edits,
  Single Responsibility/Interface Segregation across
  eligibility/calculation/posting/presentation, Liskov Substitution via
  a shared input/atomicity/error contract every implementation must
  honor), and explicitly names and rejects two alternative OOD shapes
  (inheritance-per-product, Service Locator/untyped rule callbacks) with
  reasons. This is genuinely good architecture-decision writing, not
  boilerplate.

**Bonus — a fix I hadn't explicitly asked for but had flagged as a minor
nit in §9.3.** The inconsistent terminology ("Feature Flag 或 Registry
Selection" vs. "Rollback Adapters" vs. tasks.md's "Adapter") is now
unified to a single term, **"Policy Adapter Registry"** / **"Policy
Adapter Registry Selection"**, used consistently in design.md's
遷移與回復 (steps 3 and 6), 決策紀錄, and tasks.md 5.1 and 5.4 alike.
That was a "worth picking one term" nit, not a request — good that it
got swept up in the same pass.

I re-checked for regressions from the edit itself: the new Service
Boundaries and OOD sections don't contradict the existing
Decisions/資料流/安全與可靠性 sections (e.g., the Service Boundaries
entry for "Typed Policy Registry" — "不得接受任意 expression、dynamic
code 或直接存取 persistence" — reinforces rather than duplicates the
Decisions section's "不得注入程式或繞過 Balance Core"), tasks.md's
checkboxes are still all appropriately unchecked (nothing here claims
work is done that isn't), and task 6.3 still ends on openspec validate
--all --strict --no-interactive. Nothing new is inconsistent.

**Revised score: 9.3 / 10** (Change-management process sub-score moves
from 9.3 → 9.7 in the breakdown table below to reflect this). Everything
raised specifically about openspec/changes/ across §5, §7, and §9 is now
resolved. The items still open are all in openspec/specs/ or the
surrounding tooling (§4's scenario-coverage pattern, §3's ACKNOWLEDGE
omission, §8's CLI reproducibility) — none of them are in changes/
anymore.
