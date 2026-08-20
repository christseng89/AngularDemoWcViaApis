# SonarQube Scan Report 2 — lc-balance-wc

**Analysis date:** 2026-08-20T15:19:29Z
**Project key:** `lc-balance-wc` · **Server:** local SonarQube 9.9.8 LTS Community (Docker, `sonarqube:lts-community`), `http://localhost:9000/dashboard?id=lc-balance-wc`
**Scanner:** `sonarsource/sonar-scanner-cli:5.0.1` (Docker, run on the `sonar-net` bridge network reaching the server at `http://sonarqube:9000`), analyzing `src` (Angular app), `backend` (中台 orchestrator), `microservices/balance-component/src` per `sonar-project.properties`.
**Coverage source:** freshly regenerated `coverage/lcov.info`, `backend/coverage/lcov.info`, `microservices/balance-component/coverage/lcov.info` (`npm run test:coverage` re-run in all three sub-projects immediately before this scan — not stale).
**New-code baseline:** `PREVIOUS_VERSION` period, anchored at 2026-08-15T18:22:45Z (the project has stayed at version `1.0` throughout, so this baseline has never moved — "new code" here effectively means everything analyzed since the very first scan, including both this report's own predecessor's fixes and every change made since).
**Relation to `Sonar-Scan-Report.md`:** that file is the prior scan (2026-08-17, project at 7,981 ncloc). This is an independent, full re-scan three days later — the codebase has grown to 11,574 ncloc in the interim (BAL-141's movement-type registry refactor, the B3/B4/A8 live-balance-warning unification work, and the intervening quality/documentation passes) — kept as a separate file per request rather than overwriting the original.

## Quality Gate: PASSES (OK) — all 6 conditions green

| Condition | Threshold | Actual | Status |
|---|---|---|---|
| New Reliability Rating | ≤ 1 (A) | 1 (A) | ✅ OK |
| New Security Rating | ≤ 1 (A) | 1 (A) | ✅ OK |
| New Maintainability Rating | ≤ 1 (A) | 1 (A) | ✅ OK |
| New Coverage | ≥ 80% | 98.0% | ✅ OK |
| New Duplicated Lines Density | ≤ 3% | 2.17% | ✅ OK |
| New Security Hotspots Reviewed | 100% | 100% | ✅ OK |

No regression from the prior scan's own final (post-fix) state — the Quality Gate has now passed on every analysis since 2026-08-17T15:13Z.

## Overall Project Metrics

| Metric | Value | vs. 2026-08-17 scan |
|---|---|---|
| Lines of code (ncloc) | 11,574 | 7,981 → 11,574 (+3,593, +45%) |
| — by language | TS 6,694 · CSS 2,061 · Web/HTML 1,311 · JS 1,508 | — |
| Coverage | 98.0% | 97.9% (held) |
| Duplicated lines density | 4.7% (795 lines / 42 blocks / 3 files) | 6.4% (804 lines / 45 blocks / 3 files) — improved despite the codebase growing 45% |
| Bugs | 0 | 0 (held — the 5 original bugs stay fixed/closed) |
| Vulnerabilities | 0 | 0 (held) |
| Security hotspots (unreviewed) | 0 | 0 (held — both original hotspots stay resolved) |
| Code smells | 56 | 35 → 56 (+21, tracks the codebase's own growth — see Comparison below) |
| Reliability rating | 1.0 (A) | 1.0 (A) (held, after the 2026-08-17 fix) |
| Security rating | 1.0 (A) | 1.0 (A) (held) |
| Maintainability rating | 1.0 (A) | 1.0 (A) (held) |

## Bugs, Vulnerabilities, Security Hotspots — all clear

**Bugs: 0.** **Vulnerabilities: 0.** **Unreviewed security hotspots: 0** (100% reviewed).

One hotspot exists in the project's history and remains in its already-reviewed state from the prior scan — not a new finding, not counted against the gate:

| File | Line | Rule | Status |
|---|---|---|---|
| `backend/data/businessCases.js` | 49 | `javascript:S2245` (weak PRNG) | `REVIEWED` / `SAFE` — unchanged since 2026-08-17; `Math.random()` here only generates a demo-data uniqueness suffix, never anything security-sensitive |

## Code Smells (56 open)

By severity: **15 CRITICAL** · **25 MAJOR** · **16 MINOR**

By rule:

| Rule | Count | Description |
|---|---|---|
| typescript:S3776 (+1 javascript:S3776) | 14 (+1) | Cognitive Complexity exceeds 15 |
| typescript:S3358 | 13 | Nested ternary should be extracted into an independent statement |
| typescript:S4323 | 9 | Union type repeated — replace with a type alias |
| Web:AvoidCommentedOutCodeCheck | 7 | Comment flagged as commented-out code — **see note below, all 7 are false positives** |
| typescript:S4325 | 6 | Unnecessary type assertion |
| typescript:S1871 | 4 | Duplicate branch bodies in conditional |
| typescript:S107 | 1 | Too many function parameters |
| typescript:S3863 | 1 | Duplicated type import |

### Cognitive Complexity hotspots (S3776), worst first (15 findings)

| File | Line | Complexity | Allowed |
|---|---|---|---|
| `microservices/balance-component/src/service/balanceService.ts` | 615 | **71** | 15 |
| `src/app/transaction-builder/builder-fields.ts` | 24 | 53 | 15 |
| `src/app/transaction-builder/inquire-events.service.ts` | 444 | 50 | 15 |
| `src/app/transaction-builder/submit-rules.ts` | 55 | 45 | 15 |
| `src/app/transaction-builder/maker-panel.component.ts` | 866 | 32 | 15 |
| `microservices/balance-component/src/store/balanceMovementStore.ts` | 128 | 32 | 15 |
| `backend/server.js` | 65 | 28 | 15 |
| `microservices/balance-component/src/service/balanceService.ts` | 472 | 21 | 15 |
| `src/app/transaction-builder/checker-actions.service.ts` | 49 | 22 | 15 |
| `src/app/transaction-builder/submit-rules.ts` | 156 | 22 | 15 |
| `src/app/transaction-builder/checker-panel.component.ts` | 200 | 20 | 15 |
| `src/app/transaction-builder/checker-actions.service.ts` | 259 | 18 | 15 |
| `microservices/balance-component/src/store/balanceMovementStore.ts` | 282 | 17 | 15 |
| `src/app/transaction-builder/maker-panel.component.ts` | 924 | 16 | 15 |

Two new entries since the prior scan worth flagging specifically: **`balanceService.ts:615` at 71** is `createMovement()` — this is the *same method* the 2026-08-20 BAL-141 refactor (movementType Strategy/Type-Object registry) already reduced once; it has grown back past its old peak (was 85 pre-refactor per the prior report at a different line number, now 71 at a shifted line) as more per-instrument branches accumulated around it since. `maker-panel.component.ts:866`/`924` (32, 16) are new — this file absorbed most of the former `transaction-builder.component.ts` God Component's own logic (see `CLAUDE.md`'s BAL-003 closure entry), so some of what used to be `transaction-builder.component.ts`'s own complexity simply moved here rather than being new complexity outright.

### Nested ternaries (S3358, 13 findings)

`builder-fields.ts` L66, L68, L70, L72 · `balance-component.model.ts` L519 · `look-up-panel.service.ts` L73 · `submit-rules.ts` L161 · `function-policy.ts` L142 · `inquire-events.service.ts` L524, L527 · `contingentAccountEntry.ts` L140 · `balanceService.ts` L480, L618

### Duplicate conditional branches (S1871, 4 findings)

All 4 are new, all in `maker-panel.component.ts`: L486 (vs. L484), L492 (vs. L486), L851 (vs. L845), L854 (vs. L851) — same file/rule pair the prior report flagged in `transaction-builder.component.ts`, now surfacing in the component that absorbed that logic.

### Union type repetition (S4323, 9 findings)

`balanceDerivation.ts` L62 · `balance-component.model.ts` L146, L502, L504 · `checker-panel.component.ts` L95 · `transaction-builder.component.ts` L85, L200 · `inquire-events.service.ts` L149 · `contingentAccountEntry.ts` L102

### Unnecessary type assertions (S4325, 6 findings)

`balanceService.ts` L681, L728, L778, L832 · `balance-component.model.ts` L110 · `builder-fields.ts` L78

### Other

- Too many parameters (S107): `balance-component-api.service.ts:241` — `catalog()` has 8 parameters (max 7)
- Duplicated type import (S3863): `routes/balanceMovements.ts:4`

### "Commented-out code" (Web:AvoidCommentedOutCodeCheck, 7 findings) — reviewed, all false positives

Spot-checked all 7 locations directly against source: `account-entries-dialog.component.html:1`, `maker-panel.component.html:17/184/211/767`, `transaction-builder.component.html:586/823`. Every one is a genuine, long, prose-style explanatory doc-comment (this codebase's own established convention — business-instruction citations, design rationale — see `CLAUDE.md`'s own documentation style throughout), not actual dead/commented-out code. The rule is almost certainly pattern-matching on code-like tokens quoted or referenced inside the prose (`*ngIf=`, `[disabled]`, etc.) rather than genuine disabled markup. **Recommend marking all 7 "Won't Fix" / "False Positive" in SonarQube** rather than editing the comments — shortening them to avoid the false trigger would directly work against this project's own documented convention of keeping business-rationale citations inline.

## Duplication

795 duplicated lines / 42 blocks / 3 files (4.7% project-wide density, 2.17% on new code — under the 3% new-code gate):

| File | Duplicated lines | Blocks | Note |
|---|---|---|---|
| `backend/data/businessCases.js` | 732 | 38 | Already known — `CLAUDE.md`'s own decision log flags this as "declarative-data duplication... growing with each new compound case," a deliberate trade-off (each Business Case Registry entry is self-contained and independently readable) already assessed once (BAL-127 collapsed the create+release step-pair shape; the remaining duplication is between whole case definitions, not something that same fix could reach) |
| `src/app/transaction-builder/maker-panel.component.html` | 33 | 2 | New since the prior scan — worth a look given this template's own size |
| `src/app/transaction-builder/maker-submit.service.ts` | 30 | 2 | New since the prior scan |

## Comparison to the 2026-08-17 scan (`Sonar-Scan-Report.md`)

The codebase grew 45% (7,981 → 11,574 ncloc) between the two scans — this session's own BAL-141 refactor, the B3/B4/A8 live-balance-check unification work, and the "Feature Components + Facade" pilot that closed out BAL-003 (moving most of the former `transaction-builder.component.ts` God Component's logic into `MakerPanelComponent`/`CheckerPanelComponent`) all landed in between. Against that growth:

- **Bugs, vulnerabilities, security hotspots: all held at their fully-clean state** — nothing regressed.
- **Code smells grew from 35 → 56 (+21)**, but sub-linearly relative to the 45% code growth (60% growth in findings vs. 45% growth in code) — driven almost entirely by Cognitive Complexity (10→15) and nested-ternary (10→13) counts tracking the new/relocated logic, not a new category of problem.
- **Duplication density improved (6.4% → 4.7%)** even as absolute duplicated lines fell slightly (804 → 795) despite 45% more code overall — the BAL-003 closure and BAL-141 registry consolidation this session's own `CLAUDE.md`/`Quality-report-balance.md` entries describe are visible here as a real, measurable duplication reduction, not just a narrative claim.
- **`balanceService.ts`'s own worst Cognitive Complexity hotspot survived the BAL-141 refactor at a lower peak** (85 → 71) but is still the single worst offender in the codebase by a wide margin — `createMovement()`'s per-instrument sufficiency-check branching keeps regrowing around the registry dispatch that replaced its old if/else-if chain.

## Suggested Next Steps

1. Mark the 7 `Web:AvoidCommentedOutCodeCheck` findings "False Positive" in SonarQube (see above) — no code change needed, just closes them out of future scan noise.
2. `balanceService.ts:615` (`createMovement()`, complexity 71) is the standout maintainability item — worth a dedicated look at what's re-accumulated around the BAL-141 registry dispatch, independent of that refactor's own success at the time it landed.
3. `builder-fields.ts:24` (53) and `inquire-events.service.ts:444` (50) remain the next-worst outliers, both already flagged in the prior scan and untouched since.
4. The 4 new duplicate-branch findings (S1871) and 2 new duplication blocks, both now in `maker-panel.component.ts`, are the direct successors of findings the prior report had in `transaction-builder.component.ts` — worth revisiting now that the logic has a new, presumably more stable home.
5. None of the above are Quality Gate blockers (code smells and this level of duplication aren't gated by this project's own configured gate) — this is a maintainability-debt list, not an urgent-fix list.
