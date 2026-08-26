# SonarQube Scan Report — lc-balance-wc

**Analysis date:** 2026-08-26T07:57:36Z
**Project key:** `lc-balance-wc` · **Project name:** LC Balance Component Demo
**Server:** local SonarQube 9.9.8.100196 LTS Community Edition (Docker container `sonarqube`, image `sonarqube:lts-community`), dashboard at `http://localhost:9000/dashboard?id=lc-balance-wc`
**Scanner:** `sonarsource/sonar-scanner-cli:5.0.1` (Docker), run on the `sonar-net` bridge network reaching the server at `http://sonarqube:9000`, per this repo's existing `sonar-project.properties` — `sonar.sources=src,backend,microservices/balance-component/src`, `sonar.tests=src,backend/test,microservices/balance-component/test`. This is the **third** real scan of this project (see `Sonar-Scan-Report.md`, 2026-08-17, and `SonarQube-report2.md`, 2026-08-20) — same server, same scanner image, same properties file, so all three are directly comparable.
**Coverage source:** existing `coverage/lcov.info`, `backend/coverage/lcov.info`, `microservices/balance-component/coverage/lcov.info` on disk (regenerated ~90 minutes earlier by a full `npm test` run in all three sub-projects, all green: Angular 1171/1171, backend 38/38, microservice 585/585 — no source changed in between, so these reports are current).
**Analysis task:** `AaA9EvX9QJgLWwggedKr` → CE task `SUCCESS`, executed in 7.4s server-side after a ~14m45s scanner run (dominated by TypeScript program creation/analysis under emulation — see Methodology note at the end).
**Report basis:** every number in this report was pulled directly from the SonarQube Web API (`/api/qualitygates/project_status`, `/api/measures/component`, `/api/measures/component_tree`, `/api/issues/search`, `/api/hotspots/search`, `/api/duplications/show`) against this analysis — **not** a manual code review or a SonarQube-style hand assessment.

---

## Quality Gate: **FAILED (ERROR)** — 1 of 6 conditions failing

| Condition (New Code, since 2026-08-15 baseline) | Threshold | Actual | Status |
|---|---|---|---|
| New Reliability Rating | ≤ 1 (A) | 1 (A) | ✅ OK |
| New Security Rating | ≤ 1 (A) | 1 (A) | ✅ OK |
| New Maintainability Rating | ≤ 1 (A) | 1 (A) | ✅ OK |
| New Coverage | ≥ 80% | 97.6% | ✅ OK |
| New Security Hotspots Reviewed | 100% | 100% | ✅ OK |
| **New Duplicated Lines Density** | **≤ 3%** | **5.15%** | ❌ **ERROR** |

**This is a real regression from the previous scan** (`SonarQube-report2.md`, 2026-08-20: this same condition passed at 2.17%). Root cause identified below in **Duplication**.

**Methodology caveat (affects how to read "New Code" here):** the scanner log emits `WARN: SCM provider autodetection failed` — `lc-balance/` is a subdirectory of a larger monorepo and has no `.git` of its own at its root, so the scanner cannot determine which lines actually changed since the 2026-08-15 baseline via git blame. Confirmed via the API: `new_duplicated_lines` (2,532) is numerically identical to overall `duplicated_lines` (2,532), and every one of the 59 open issues has `new_violations = violations = 59` — i.e. **the "New Code" period is effectively treating the entire analyzed codebase as new**, not a genuine line-level diff. This is consistent across all three scans done so far (the 2026-08-20 report shows the same "new ≠ overall, but new tracks total duplication proportionally" pattern), so it is not a newly-introduced measurement artifact — but it does mean the Quality Gate's "New Code" conditions in this project should be read as **project-wide** conditions, not "only what changed since the last release."

---

## Overall Project Metrics

| Metric | Value | vs. 2026-08-20 scan (`SonarQube-report2.md`) |
|---|---|---|
| Lines of code (ncloc) | **15,040** | 11,574 → 15,040 (+3,466, +30%) |
| — by language | TS 8,710 · JS 2,881 · CSS 2,091 · Web/HTML 1,358 | TS 6,694 · JS 1,508 · CSS 2,061 · Web/HTML 1,311 |
| Files analyzed (main) | 81 | — |
| Coverage | **97.6%** (line 98.6% · branch 96.2%) | 98.0% (held, −0.4pp on a 30% larger codebase) |
| Duplicated lines density | **11.4%** (2,532 duplicated lines / 116 blocks / 7 files) | 4.7% (795 lines / 42 blocks / 3 files) — **+6.7pp, the headline regression** |
| Bugs | **0** | 0 (held) |
| Vulnerabilities | **0** | 0 (held) |
| Security hotspots (unreviewed) | **0** (1 hotspot exists, already reviewed) | 0 (held) |
| Code smells | **59** | 56 → 59 (+3, essentially flat despite +30% code) |
| Reliability rating | **1.0 (A)** | 1.0 (A) (held) |
| Security rating | **1.0 (A)** | 1.0 (A) (held) |
| Maintainability rating (SQALE) | **1.0 (A)** | 1.0 (A) (held) |
| Security review rating | **1.0 (A)** | — |
| Cyclomatic complexity | **2,514** | — |
| Cognitive complexity | **1,672** | — |
| Technical debt (SQALE index) | **651 min ≈ 10.9 hours** | — |

**Read this together with the Quality Gate section above**: the only metric that got materially worse is duplication (see next section) — every reliability/security/maintainability rating held at A, coverage held near 98%, and code-smell growth (+3) was far sub-linear to the 30% code growth, meaning the codebase's underlying design didn't degrade — one specific, identifiable cause did (below).

---

## Bugs, Vulnerabilities, Security Hotspots — all clear

**Bugs: 0. Vulnerabilities: 0. Unreviewed security hotspots: 0** (100% reviewed). No regression on any of the three headline security/reliability categories since either prior scan.

One hotspot exists in the project's history, carried forward from the 2026-08-17 scan in its already-reviewed state — not a new finding, does not count against the gate:

| File | Line | Rule | Status |
|---|---|---|---|
| `backend/data/businessCases.js` | 54 | `javascript:S2245` (weak PRNG) | `REVIEWED` / `SAFE` — unchanged since 2026-08-17; `Math.random()` here only generates a demo-data uniqueness suffix for a synthetic LC number, never anything security-sensitive (this prototype has no real auth at all — see `lc-balance/CLAUDE.md`'s own BAL-001 Gate Condition) |

---

## Code Smells (59 open, 0 Bugs, 0 Vulnerabilities)

By severity: **17 CRITICAL · 28 MAJOR · 13 MINOR · 1 INFO** (vs. 2026-08-20: 15 CRITICAL · 25 MAJOR · 16 MINOR)

By rule:

| Rule | Count | Description |
|---|---|---|
| `typescript:S3776` (+1 `javascript:S3776`) | 16 (+1) | Cognitive Complexity exceeds 15 |
| `typescript:S3358` | 16 | Nested ternary should be extracted into an independent statement |
| `typescript:S4323` | 10 | Union type repeated — replace with a type alias |
| `Web:AvoidCommentedOutCodeCheck` | 7 | Comment flagged as commented-out code — **see note below, all 7 remain false positives** |
| `typescript:S1871` | 4 | Duplicate branch bodies in conditional |
| `typescript:S4325` | 2 | Unnecessary type assertion |
| `typescript:S107` | 1 | Too many function parameters |
| `typescript:S1135` | 1 | `TODO` comment left in code |
| `typescript:S3863` | 1 | Duplicated type import |

By location: **44 of 59 (75%)** are in `src/app/transaction-builder` (the Angular Maker/Checker feature area — now spread across the extracted services/components, not concentrated in one God Component; see Complexity section), 7 in `microservices/balance-component/src/service` (`balanceService.ts`), 3 each in `.../domain` and `.../store`, 1 each in `backend` and `.../routes`.

### Cognitive Complexity hotspots (S3776/CRITICAL, all 17 findings, worst first)

| File | Line | Complexity | Allowed | Effort |
|---|---|---|---|---|
| `microservices/balance-component/src/service/balanceService.ts` | 1737 | **93** | 15 | 1h23min |
| `src/app/transaction-builder/submit-rules.ts` | 56 | 60 | 15 | 50min |
| `src/app/transaction-builder/builder-fields.ts` | 24 | 63 | 15 | 53min |
| `src/app/transaction-builder/inquire-events.service.ts` | 486 | 46 | 15 | 36min |
| `microservices/balance-component/src/store/balanceMovementStore.ts` | 136 | 39 | 15 | 29min |
| `backend/server.js` | 73 | 36 | 15 | 26min |
| `microservices/balance-component/src/service/balanceService.ts` | 1575 | 36 | 15 | 26min |
| `microservices/balance-component/src/service/balanceService.ts` | 1310 | 30 | 15 | 20min |
| `src/app/transaction-builder/maker-panel.component.ts` | 946 | 32 | 15 | 22min |
| `src/app/transaction-builder/submit-rules.ts` | 200 | 31 | 15 | 21min |
| `src/app/transaction-builder/checker-actions.service.ts` | 49 | 22 | 15 | 12min |
| `src/app/transaction-builder/balance-component.model.ts` | 611 | 19 | 15 | 9min |
| `src/app/transaction-builder/checker-actions.service.ts` | 259 | 18 | 15 | 8min |
| `src/app/transaction-builder/submit-rules.ts` | 274 | 18 | 15 | 8min |
| `microservices/balance-component/src/service/balanceService.ts` | 679 | 17 | 15 | 7min |
| `microservices/balance-component/src/store/balanceMovementStore.ts` | 381 | 17 | 15 | 7min |
| `src/app/transaction-builder/maker-panel.component.ts` | 1004 | 16 | 15 | 6min |

**Worst single offender: `balanceService.ts:1737` at 93** — this is `release()`, not `createMovement()` (the prior scan's worst offender, `createMovement()` at line 615/complexity 71, has since been decomposed via the BAL-142 pass documented in `CLAUDE.md` — `resolveOrCreateContract()` extraction — and no longer appears in this list at all, a genuine, measured improvement). `release()` has instead grown into the new worst offender: it now carries the Checker-side re-check for essentially every mandatory-field/business-day/currency/maker-checker-separation guard added since 2026-08-20 (`assertExpiryDateRequired`, `assertExpiryDateIsBusinessDay`, `assertNaturalKeyFieldsRequired`, `assertSecondaryRefRequired`, `assertTenorRequired`, `assertReasonCodeRequired`, `assertMakerCheckerSeparation`, `isSightUtilizeFinalize`-driven snapshot routing) — each individually small and independently tested, but their accumulation inside one dispatch method is exactly the same "defense-in-depth re-check accretion" pattern `createMovement()` itself went through before BAL-142.

`submit-rules.ts` and `builder-fields.ts` (Angular) remain persistent, previously-flagged outliers (both already called out in the 2026-08-20 report, both untouched since).

### Nested ternaries (S3358, 16 findings)

`contingentAccountEntry.ts` L148, L162 · `balanceService.ts` L2270 · `balanceMovementStore.ts` L202 · `balance-component.model.ts` L629 · `builder-fields.ts` L96, L98, L100, L102, L104 · `function-policy.ts` L148 · `inquire-events.service.ts` L560, L563 · `look-up-panel.service.ts` L73 · `submit-rules.ts` L208, L209

`builder-fields.ts`'s own 5 nested ternaries (L96–104) are the shared Formly field-factory this project's own `CLAUDE.md` describes ("Protected System-Controlled Fields" entry) — one place computing per-field `disabled`/`required` state across all 14 A1–A9/B1–B5 functions, so the ternary nesting is a direct reflection of that field's own genuinely multi-way derivation, not an accident.

### Duplicate conditional branches (S1871, 4 findings)

All 4 in `maker-panel.component.ts`: L499 (vs. L497), L505 (vs. L499), L925 (vs. L919), L928 (vs. L919) — same file the 2026-08-20 report already flagged for this rule (it had absorbed this pattern from the old `transaction-builder.component.ts` God Component); line numbers have shifted with the file's continued growth but the underlying branches have not been consolidated since.

### Union type repetition (S4323, 10 findings)

`contingentAccountEntry.ts` L102 · `balanceService.ts` L1488 · `balance-component.model.ts` L165, L602, L604 · `balance-snapshot-box.component.ts` L11 · `checker-panel.component.ts` L107 · `inquire-events.service.ts` L188 · `transaction-builder.component.ts` L102, L237

### Unnecessary type assertions (S4325, 2 findings)

`balance-component.model.ts` L129 · `builder-fields.ts` L110

### Other

- **Too many parameters (S107)**: `balance-component-api.service.ts:262` — `catalog()` has 8 parameters (max 7 allowed), unchanged from the 2026-08-20 finding (was line 241, shifted by file growth).
- **Duplicated type import (S3863)**: `routes/balanceMovements.ts:4`, unchanged from 2026-08-20.
- **TODO comment left in code (S1135, new since 2026-08-20)**: `balanceService.ts:835`, INFO severity, 0 effort.

### "Commented-out code" (`Web:AvoidCommentedOutCodeCheck`, 7 findings) — still open, still false positives

The 2026-08-20 report recommended marking these "Won't Fix / False Positive" in SonarQube; **that has not been done** — all 7 are still `OPEN` in this scan. Locations have shifted with the codebase's own restructuring:

| File | Line |
|---|---|
| `account-entries-dialog.component.html` | 1 |
| `inquire-events.component.html` | 8, 144 |
| `maker-panel.component.html` | 18, 187, 215, 789 |

Two of these (`inquire-events.component.html:8/144`) are **new locations** — this file did not exist at the 2026-08-20 scan; it was created by the "Part B — InquireEventsComponent extraction" work `CLAUDE.md` records for 2026-08-21, which moved the Inquire Events view (and its own prose-style doc comments) out of `transaction-builder.component.html`. `transaction-builder.component.html` itself no longer triggers this rule at all (it shrank to the thin orchestration layer this project's own decision log describes). Spot-checked all 7 against source again this scan: every one remains a genuine, long, prose-style explanatory doc-comment (business-instruction citations / design rationale, this codebase's established convention per `CLAUDE.md`), not actual dead markup — same disposition as before.

---

## Complexity

| Metric | Value |
|---|---|
| Cyclomatic complexity (project) | 2,514 |
| Cognitive complexity (project) | 1,672 |
| Functions | 983 |
| Classes | 33 |
| Statements | 3,079 |

Worst files by Cognitive Complexity (all far above the 15-per-function threshold in aggregate, driving the CRITICAL code smells above):

| File | Cognitive Cx | Cyclomatic Cx | ncloc |
|---|---:|---:|---:|
| `microservices/balance-component/src/service/balanceService.ts` | **355** | 411 | 1,198 |
| `src/app/transaction-builder/maker-panel.component.ts` | 221 | 340 | 977 |
| `src/app/transaction-builder/submit-rules.ts` | 109 | 109 | 188 |
| `src/app/transaction-builder/inquire-events.service.ts` | 84 | 136 | 372 |
| `src/app/transaction-builder/balance-component.model.ts` | 84 | 100 | 496 |
| `microservices/balance-component/src/store/balanceMovementStore.ts` | 79 | 91 | 361 |
| `src/app/transaction-builder/builder-fields.ts` | 70 | 78 | 172 |
| `src/app/transaction-builder/checker-actions.service.ts` | 67 | 124 | 264 |
| `src/app/transaction-builder/picker-selection.service.ts` | 55 | 97 | 330 |
| `backend/server.js` | 50 | 36 | 138 |

`balanceService.ts` (1,198 ncloc) and `maker-panel.component.ts` (977 ncloc) are, respectively, the largest file in the microservice and the largest file in the Angular app (`CLAUDE.md` independently confirms `maker-panel.component.ts` at "1,160 lines" as this sub-project's largest file — the ~180-line gap from this scan's 977 ncloc is comments/blank lines, which `ncloc` excludes) — complexity concentration tracks file size concentration, not a separate problem.

---

## Duplication — **the one real regression this scan (see Quality Gate above)**

**11.4% project-wide (2,532 duplicated lines / 116 blocks / 7 files)**, up from 4.7% (795 lines / 42 blocks / 3 files) on 2026-08-20 — **more than doubled** while the codebase itself grew only 30%.

| File | Duplicated lines | Density | ncloc | Note |
|---|---:|---:|---:|---|
| `backend/data/businessCases.js` | **2,057** | 70.6% | 2,702 | **The dominant cause — 81% of all duplication project-wide.** Grew from 732 lines (2026-08-20) to 2,057 (+1,325). Already a known, disclosed trade-off (`CLAUDE.md`'s BAL-127 entry: each Business Case Registry entry is deliberately self-contained/independently readable rather than DRY'd across cases) — but the registry grew from ~21 to 27 cases (Import Case 13–15, Export Case #12, per the F1 decision-log entries) *and* every existing case was subsequently touched by two repo-wide mechanical edits (the `expiryDate`-mandatory fix shifting 25 date occurrences, and the 5-more-mandatory-fields fix touching all 27 cases' `tenorType`/`sourceTransactionRef`/`reasonCode`) — both edits necessarily made already-similar case blocks *more* textually similar to each other, which is very likely why this specific file's duplication nearly tripled between the two scans even though `createAndRelease()` (BAL-127) was never reverted. |
| `microservices/balance-component/src/domain/domesticCalendar.ts` | 71 | 73.2% | 54 | New file (2026-08-26). |
| `src/app/transaction-builder/domestic-calendar.ts` | 67 | 84.8% | 54 | New file (2026-08-26). **This pair is a genuine cross-file duplicate of each other** (confirmed via `/api/duplications/show` — the two files share a 67–71 line block), by explicit, documented design: both files' own top doc comments state they are "kept in sync by hand... a copy, not a shared import" because the Angular app and the microservice are two independently deployable projects — the same convention `CLAUDE.md` already applies to `balance-component-api.service.ts`'s `BalanceMovement` interface. Not a defect; SonarQube has no way to know two independently-deployed projects intentionally share logic. |
| `microservices/balance-component/src/db/migrations.ts` | 244 | 47.5% | 486 | Structurally repetitive by nature (each `Migration` entry follows the same `id`/`up`/`down` shape) — same category of "declarative-data duplication" as `businessCases.js`, at a much smaller scale. |
| `src/app/transaction-builder/maker-panel.component.html` | 33 | 4.1% | 545 | Unchanged since 2026-08-20 (same 33 lines / 2 blocks). |
| `src/app/transaction-builder/maker-submit.service.ts` | 30 | 9.0% | 274 | Unchanged since 2026-08-20 (same 30 lines / 2 blocks). |
| `microservices/balance-component/src/service/balanceService.ts` | 30 | 1.3% | 1,198 | New since 2026-08-20 — minor, 1.3% density is not itself a concern. |

**Verdict**: the Quality Gate failure is real and traceable to one specific, already-understood cause (`businessCases.js`'s declarative registry growth), plus one small, explicitly-intentional new pair (`domesticCalendar.ts`/`domestic-calendar.ts`). Neither reflects a design regression — but the gate is failing on an objective threshold regardless of intent, so see Recommendations below.

---

## Test Coverage

**97.6% overall** (line 98.6%, branch 96.2%) — computed from the three sub-projects' own `lcov.info` files, matching each sub-project's own independently-run Jest coverage (Angular 98.82%/96.87% stmt/branch, backend 97.76%/95.91%, microservice 99.14%/95.25% per today's own full `npm test` runs — small differences from SonarQube's own numbers are expected, since SonarQube's `coverage` metric is a line+condition blend computed its own way from the same lcov data, not a re-run of Jest).

| Module (directory) | ncloc | Coverage | Line Cov | Branch Cov |
|---|---:|---:|---:|---:|
| `src` (Angular app) | 8,598 | 98.0% | 98.7% | 96.9% |
| `microservices/balance-component/src` | 3,561 | 97.1% | 98.7% | 95.3% |
| `backend` | 2,881 | 96.1% | 96.2% | 95.9% |
| `backend/data` | 2,702 | 100.0% | 100.0% | 100.0% |
| `microservices/balance-component/src/db` | 725 | 94.8% | 98.1% | **88.0%** |
| `microservices/balance-component/src/validation` | 32 | 94.1% | 100.0% | 83.3% |

Every module clears each sub-project's own configured **95% Jest coverage floor** (per `lc-balance/CLAUDE.md`) on aggregate — the two sub-100% rows above (`db`, `validation`) are small folders whose local branch coverage dips are absorbed by the rest of their own sub-project's average. No coverage regression: **97.6% now vs. 98.0%** on 2026-08-20 is a 0.4-point dip on a codebase that grew 30% (new code, not shrinking coverage of old code) — well within normal variance for this scale of change and nowhere near the 80% New Coverage gate threshold.

---

## Comparison to the 2026-08-20 scan (`SonarQube-report2.md`)

The codebase grew 30% (11,574 → 15,040 ncloc) in the 6 days between scans — the F1 AUTO EXPIRY/AUTO CLOSE/Reopen feature's remaining follow-ups, the mandatory-field-enforcement passes (`expiryDate`, natural-key fields, `tenorType`, `sourceTransactionRef`, `reasonCode`), the domestic business-day rule (this session), the "Run All Cases" fixes, and 6 new Business Case Registry entries all landed in between (see `lc-balance/CLAUDE.md`'s own decision log for the full list). Against that growth:

- **Bugs, vulnerabilities, security hotspots: all held at their fully-clean state** — nothing regressed. Ratings (Reliability/Security/Maintainability/Security Review) all still 1.0 (A).
- **Coverage essentially held** (98.0% → 97.6%, −0.4pp on +30% code).
- **Code smells grew only +3** (56 → 59) despite +30% code — sub-linear, and the composition shifted rather than uniformly grew: CRITICAL/Cognitive-Complexity findings grew (the accumulation inside `release()` and `submit-rules.ts` described above), while MINOR findings actually fell (16 → 13).
- **Duplication density more than doubled** (4.7% → 11.4%) and **the New Code Duplication gate flipped from PASS (2.17%) to FAIL (5.15%)** — this is the one genuine regression this scan surfaces, and it is fully traceable to `backend/data/businessCases.js`'s registry growth (see Duplication section) plus the new, intentionally-duplicated `domesticCalendar.ts` pair.
- `balanceService.ts`'s worst Cognitive Complexity hotspot **moved, not disappeared**: `createMovement()` (71, 2026-08-20's worst) was successfully decomposed (BAL-142, documented in `CLAUDE.md`) and no longer appears in this scan's top list at all — but `release()` (93, today's worst) grew past it by absorbing the same kind of defense-in-depth guard accumulation `createMovement()` had before its own refactor.

---

## Suggested Next Steps (priority order)

1. **[Quality Gate blocker] Decide a disposition for `businessCases.js`'s duplication, since it is now actively failing the gate.** Three real options, in order of how much this project's own established "each case is self-contained/independently readable" trade-off (BAL-127) should be preserved:
   - **(a) Raise or override the New Duplicated Lines Density threshold for this project** in SonarQube (e.g. to 12–15%) with a documented rationale referencing BAL-127 — the cheapest option, and honest about the trade-off already being a deliberate one; or
   - **(b) Exclude `backend/data/businessCases.js` from `sonar.cpd.exclusions`** in `sonar-project.properties` — keeps the gate meaningful for genuine source code while formally acknowledging this one declarative-data file was never meant to be judged by this metric; or
   - **(c) Actually reduce the duplication** by extracting the now-repeated per-case mandatory-field defaults (`tenorType`, `sourceTransactionRef`, `reasonCode`, the shifted `expiryDate`) into a small per-instrument-type default-merging helper each case calls — real engineering work, and in tension with the "each case fully self-contained" readability goal BAL-127 explicitly chose, so only worth it if duplication keeps growing with every future case addition.

   **Recommendation: (a) or (b)**, not (c) — this project has already made and documented this trade-off once; re-opening it now would be re-litigating a settled decision without new information, which this project's own `CLAUDE.md` convention explicitly cautions against.

2. **`balanceService.ts:1737` (`release()`, Cognitive Complexity 93)** is now the single worst maintainability item in the codebase, having overtaken `createMovement()`'s old peak (71, since reduced to below this list's threshold). Worth the same kind of registry/table-based decomposition BAL-141/BAL-142 already applied to `createMovement()` — the guard-accumulation pattern is identical.
3. Mark the 7 `Web:AvoidCommentedOutCodeCheck` findings "False Positive" in SonarQube — recommended in the prior scan, still not done, still verified as false positives this scan. Zero code-change cost, removes 7 findings' worth of future scan noise.
4. `submit-rules.ts:56` (60) and `builder-fields.ts:24` (63) remain persistent, previously-flagged Cognitive Complexity outliers, untouched across two scans now.
5. The 4 duplicate-branch findings (S1871) in `maker-panel.component.ts` are unchanged since 2026-08-20 (only line numbers shifted) — worth revisiting now that this file has had time to stabilize as the logic's new home.
6. None of items 2–5 are Quality Gate blockers under the current thresholds (code smells and this project's non-`businessCases.js` duplication levels aren't gated) — only item 1 needs a decision before the next release-style checkpoint; the rest is ordinary maintainability backlog.

---

## Methodology note

This scan ran the real `sonarsource/sonar-scanner-cli:5.0.1` Docker image against the locally running SonarQube 9.9.8 LTS Community container, on the `sonar-net` Docker network, using this repository's own `sonar-project.properties`/`tsconfig.sonar.json`. The scanner container runs `linux/amd64` under emulation on this host's `linux/arm64` Docker Desktop VM, which is why the scan itself took ~14m45s (TypeScript program creation alone took ~78s combined across the two `tsconfig` roots) — purely a local-hardware artifact, not a finding. All figures in this report were read back from the SonarQube Web API after the analysis report was processed server-side (CE task `AaA9EvX9QJgLWwggedKr`, status `SUCCESS`); none were estimated, extrapolated, or reconstructed from a manual review of the source.
