# Resolution Index Backend Data-Dependency Optimization Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. That skill is unavailable here, so execute directly with Red → Green → Refactor and independent DBA/Checker review. The user authorized the local `performe_tune` branch only; do not commit, merge or push.

**Goal:** Preserve the Treasury/Trade Finance/Payment Resolution Page Definition Index exactly while reducing cold backend data reads and latency. The user's later approval accepts a narrow read of governed SSI currency data when OAS alone cannot preserve the existing options; this supersedes the earlier zero-SSI-read target, not the exact-response or no-WIP-write gates.

**Architecture:** OAS, mapping, scenario and fixture-manifest sources own definition metadata; the existing complete currency options still depend on approved SSI fixture data. Compare a narrow read-only SQL currency projection with the current indexed full-JSON join. Independent DBA found a persisted projection table would change controlled reload schema, approved logical snapshot and Settings snapshot cost; defer that migration unless narrow SQL fails a governed latency budget and a separate migration is approved.

**Tech Stack:** NestJS, TypeScript, Jest, SQLite, Nx. Backend/API only; no Angular, OAS, Settings, Lookup/Resolve/Execute, seed or development DB changes.

---

### Task 1: Baseline and equivalence oracle

**Files:** `apps/ssi-service/src/app/page-parameters/mapping-resolution-page-definition.source.spec.ts`, `apps/ssi-service/src/app/page-parameters/resolution-page-aggregation.service.spec.ts`.

1. Record base commit, dirty status, source/fixture identity and current cold/hot behavior using an approved isolated fixture; never probe the development runtime DB because the existing index GET may expire WIP.
2. Add an exact index-equivalence test for Treasury, Trade Finance and Payment: definition IDs/versions/hashes, scenario IDs/counts, statuses, input fields, pagination and order must remain governed and unchanged under the approved baseline.
3. Add a Red test proving an index cold miss must not call `FinControlledFixtureService.catalogue()` or repository `list()`/`listApplicability()` and must not invoke WIP expiry.
4. Run the focused tests and preserve Red evidence.

### Task 2: DBA-guided narrow read experiment

**Files:** `tmp/performe-tune/` for experimental evidence, then `apps/ssi-service/src/app/sqlite-ssi.repository.ts` and corresponding repository spec only if evidence supports it.

1. Build a fresh disposable DB from the approved baseline. Record SQL-only plan, row count, payload bytes, cold/hot samples and p50/p95/max for the current indexed join.
2. Write a failing repository test for a typed narrow currency projection. Keep SQLite BINARY last-ACTIVE-applicability-per-SSI semantics, global v1.1 generation preference and strict JSON boolean visibility. Apply `DISTINCT` only after those rules.
3. Include equivalent required-field fail-closed validation; do not silently admit malformed active fixtures that the current full candidate conversion rejects.
4. Compare the narrow query on the same disposable fixture. Ask independent DBA to review query plan and decide if a covering index is justified; no new table or index from one small-sample result.

### Task 3: Minimal production cut, only if Task 2 wins

**Files:** `apps/ssi-service/src/app/fin-controlled-fixture.service.ts`, `apps/ssi-service/src/app/page-parameters/mapping-resolution-page-definition.source.ts`, corresponding specs, `tmp/performe-tune/` evidence.

1. Add a narrow read-only currency port for fully configured profiles. Preserve the full candidate path for unconfigured profiles; prove the current generated profile coverage before omitting full candidates.
2. Preserve all Treasury, Trade Finance and Payment Index bytes and all 59 complete Definition bytes against the approved before oracle. Require definition identity drift = 0, logical DB snapshot before = after, WIP mutations = 0, and no SSI/Applicability full-table scan.
3. Measure multiple fresh-process cold starts and hot requests with exact before/after build identities and the same approved fixture. Do not claim p95 from one cold sample.
4. Confirm Lookup/Resolve/Execute retain authoritative current-data checks, and API/UI behavior remains unchanged without Angular edits.

### Task 4: Quality and independent gates

**Files:** only the changed code/tests and ignored evidence.

1. Run affected tests, lint, typecheck and standard `npm run verify`; report any non-Angular failures separately rather than disguising them.
2. Run independent DBA/Database Performance Engineer review and independent QA/Checker on the same candidate identity and isolated fixture/snapshot evidence.
3. If narrow SQL fails the governed latency budget, stop and propose a separately reviewed persisted projection migration covering triggers, reload, backfill, rollback, seed/schema identity and Settings snapshot impact. Do not add a table under this task without that controlled decision.
4. Only after Resolution Index is accepted, profile Settings, SSI Maintenance, RMA Maintenance and other slow APIs individually. Do not mechanically apply `DISTINCT` or omit legitimately required maintenance data. Leave `main` and `refactor` untouched; no commit, push, deploy or merge.
