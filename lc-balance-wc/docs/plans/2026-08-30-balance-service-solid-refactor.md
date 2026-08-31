# BalanceService SOLID Refactor Implementation Plan

> 狀態：已完成（2026-08-30）。`BalanceService` 保留 compatibility façade，Tasks 1–12 已落實並通過完整 regression；現行責任表見 `microservices/balance-component/src/service/README.md`。

> **For Codex:** REQUIRED SUB-SKILL: Use the repository validation commands after every extraction.

**Goal:** Reduce `BalanceService` responsibilities without changing its public API, persistence semantics, error contract, or business results.

**Architecture:** Keep `BalanceService` as a compatibility façade. Extract cohesive collaborators through composition, beginning with request validation and snapshot projection; keep SQLite stores behind the existing injected store bundle and preserve transaction boundaries.

**Tech Stack:** TypeScript, Node.js, SQLite, Decimal.js, Jest.

---

### Task 1: Lock current behavior

**Files:**
- Test: `microservices/balance-component/test/unit/service/balanceService.test.ts`
- Test: `microservices/balance-component/test/unit/service/balanceSnapshotService.test.ts`

1. Identify existing validation and snapshot characterization coverage.
2. Add focused collaborator tests for exact values and exact error messages.
3. Run the focused tests before moving behavior.

### Task 2: Extract movement request validation

**Files:**
- Create: `microservices/balance-component/src/service/movementRequestValidator.ts`
- Modify: `microservices/balance-component/src/service/balanceService.ts`
- Test: `microservices/balance-component/test/unit/service/movementRequestValidator.test.ts`

1. Move request-only validation tables and methods into one collaborator.
2. Inject the minimal movement-history port required by the A3S cross-record validation.
3. Keep validation order and error strings unchanged.
4. Delegate from the same `BalanceService` call sites.

### Task 3: Extract snapshot projection

**Files:**
- Create: `microservices/balance-component/src/service/balanceSnapshotService.ts`
- Modify: `microservices/balance-component/src/service/balanceService.ts`
- Test: `microservices/balance-component/test/unit/service/balanceSnapshotService.test.ts`

1. Move snapshot assembly, parent resolution, sibling capture and snapshot-bundle creation together.
2. Inject contract/movement read ports; do not expose SQLite details.
3. Keep `BalanceService.getBalanceSnapshot()` as a façade method.
4. Preserve historical cutoff behavior and persisted snapshot shapes exactly.

### Task 4: Full verification

Run from `microservices/balance-component`:

```bash
npm run typecheck
npm test -- --runInBand
npm run test:coverage -- --runInBand
npm run lint
npm run format:check
npm run build
```

Acceptance criteria: all commands pass, coverage remains above the repository thresholds, and no route/OAS/schema changes are introduced.

### Task 5: Extract contract lifecycle eligibility

**Files:**
- Create: `microservices/balance-component/src/service/contractLifecycleEligibilityService.ts`
- Modify: `microservices/balance-component/src/service/balanceService.ts`

1. Move event-tree traversal and Close/Expiry evaluation behind one collaborator.
2. Move batched Close/Reopen candidate listing without changing the constant-query N+1 optimization.
3. Keep `BalanceService` public methods as façade delegates.

### Task 6: Extract lifecycle sweeps

**Files:**
- Create: `microservices/balance-component/src/service/lifecycleSweepService.ts`
- Modify: `microservices/balance-component/src/service/balanceService.ts`

1. Move Auto Expiry/Close selection and cycle ordering into one service.
2. Inject a command port for movement creation/release and an event-sequence provider.
3. Preserve batch actors, reason codes, grace periods, per-candidate error isolation and expiry-before-close ordering.

### Task 7: Extract read-only balance queries

**Files:**
- Create: `microservices/balance-component/src/service/balanceQueryService.ts`
- Modify: `microservices/balance-component/src/service/balanceService.ts`
- Test: `microservices/balance-component/test/unit/service/balanceQueryService.test.ts`

1. Move contract resolution, catalogs, snapshots, event timelines, Maker Queue and audit reads into one read-only application service.
2. Keep historical snapshot cutoffs and all `NotFoundError` messages unchanged.
3. Keep `BalanceService` public methods as compatibility façade delegates so routes and OAS remain unchanged.
4. Add direct collaborator tests for active/any-status resolution, point-in-time projection, default worklist status policy, orphan detection and repository pass-throughs.

### Task 8: Extract command-time movement snapshot orchestration

**Files:**
- Create: `microservices/balance-component/src/service/movementSnapshotService.ts`
- Modify: `microservices/balance-component/src/service/balanceService.ts`
- Test: `microservices/balance-component/test/unit/service/movementSnapshotService.test.ts`

1. Move root/parent/sibling navigation and immutable snapshot-bundle construction behind one read-only collaborator.
2. Move normal-versus-finalize snapshot-column routing into the same cohesive policy.
3. Keep all movement writes and SQLite transaction boundaries in `BalanceService`.
4. Preserve command-time replacement of a persisted child with its simulated PENDING/RELEASED shape.

### Task 9: Extract Release policies

**Files:**
- Create: `microservices/balance-component/src/service/movementReleasePolicyService.ts`
- Modify: `microservices/balance-component/src/service/balanceService.ts`
- Test: `microservices/balance-component/test/unit/service/movementReleasePolicyService.test.ts`

1. Move Release-time field and Maker-Submit guards into a read-only policy service.
2. Move Close/Expire/Reopen eligibility and frozen-balance rechecks into the same policy boundary.
3. Preserve validation order and exact error messages.
4. Keep movement status writes, snapshots, recursive A6 finalization and contract side effects in `BalanceService`.

### Task 10: Extract Release side effects

**Files:**
- Create: `microservices/balance-component/src/service/movementReleaseSideEffectService.ts`
- Modify: `microservices/balance-component/src/service/balanceService.ts`
- Test: `microservices/balance-component/test/unit/service/movementReleaseSideEffectService.test.ts`

1. Move B4 Present Docs consumption and A6 referenced-UTILIZE finalization behind a narrow command port.
2. Move Close/Expire/Reopen contract transitions into the side-effect service.
3. Move Expiry Extension Amendment and conditional REVERSAL orchestration without changing write order or messages.
4. Keep the primary RELEASED movement write and transaction sequencing in `BalanceService.release()`.

### Task 11: Extract movement creation workflow

1. Move contract resolution/creation and creation-time policies behind focused collaborators.
2. Keep `BalanceService.createMovement()` as the compatibility façade and persistence coordinator.
3. Preserve idempotency, validation order, snapshot capture and post-create side effects.

### Task 12: Consolidation and architecture cleanup

1. Remove superseded private implementations and stale comments left by incremental extraction.
2. Normalize collaborator ports and naming without changing public APIs.
3. Run the complete regression, coverage, lint, typecheck, formatting and production build gates.
