# RMA Directional Message Selector Popup Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use acceptance-orchestrator to implement this plan task-by-task.

**Goal:** Apply and verify repaired Reload Test Data v15.4, then implement the approved parameter-driven RMA INBOUND／OUTBOUND Message Type popup without changing the physical direction-specific RMA model.

**Architecture:** The existing governed RMA catalogue remains the single policy source. Add shared typed contracts for the catalogue policy, canonical pair state, staged directional selection, generic Page Definition control and pair Draft command; expose server-side pair state and transactional lifecycle operations; render the capability through one reusable Angular directional-matrix component. Preserve the existing RMA page, WIP lifecycle, Maker／Checker separation, Audit snapshot semantics and Index compact display.

**Tech Stack:** Angular 22, NestJS 11, TypeScript 6, Nx, Node SQLite, Jest, OpenAPI 3, Playwright／Browser UAT.

---

### Task 1: Complete Reload Test Data Gate 2

**Files:**

- Read: `qa/FIX_DATA/rma/reload-test-data/ssi-demo.v15.4.repaired.canonical.seed.json`
- Read: `qa/FIX_DATA/rma/reload-test-data/publication-report.json`
- Backup: `tmp/gate2-backup/ssi-demo.before-v154.sqlite`
- Evidence: `tmp/gate2-backup/gate2-evidence.json`

**Steps:**

1. Verify the active seed SHA and rebuild it into a temporary SQLite database.
2. Record current live DB physical SHA, logical snapshot identity, integrity result and governed row counts.
3. Copy the exact live DB into the repository-local backup directory and verify the copy SHA.
4. Call the governed development Reload API using the configured password without logging the secret.
5. Record the returned seed identity, imported row counts and post-reload logical snapshot.
6. Verify SQLite integrity, 45 ACTIVE RMA rows, 41 known canonical groups plus four explicit development-reference-gap rows, zero known `.001.12`, zero known MT700, no duplicate known bank-direction group and preserved historical rows.
7. Ask the independent DBA reviewer to confirm query-plan／index and before／after evidence.

### Task 2: Add shared contracts and OAS first

**Files:**

- Modify: `libs/contracts/src/page-parameters.ts`
- Modify: `libs/contracts/src/index.ts`
- Modify: `openapi/swift-data-service.v1.json`
- Test: contract/OAS tests under `apps/ssi-service/src/app/page-parameters/` and `apps/ssi-portal/src/app/resolution-workbench/`

**Steps:**

1. Write failing tests for `DIRECTIONAL_MATRIX_SELECT`, stable `fieldId`, submission `path`, same-origin provider/action lookup and `DIRECTIONAL_SELECTION_SET`.
2. Write failing tests for required `schemaVersion`, categories, items, direction applicability and reproducible JCS identity.
3. Write failing tests for pair-state `ABSENT`, typed errors and pair Draft command.
4. Implement the minimum additive OAS and shared TypeScript contracts.
5. Run focused contract tests and typecheck.

### Task 3: Implement governed RMA policy and canonical pair-state API

**Files:**

- Modify: `apps/ssi-service/src/app/rma/rma-supported-message-types.ts`
- Modify: `apps/ssi-service/src/app/rma/rma-application.service.ts`
- Modify: `apps/ssi-service/src/app/rma/rma.repository.ts`
- Modify: `apps/ssi-service/src/app/rma/rma.controller.ts`
- Test: `apps/ssi-service/src/app/rma/*.spec.ts`

**Steps:**

1. Write failing policy tests for the three governed categories, official descriptions, identical canonical order, applicability and independent SHA recomputation.
2. Write failing repository tests for indexed exact Own BIC＋Counterparty BIC pair projection without full-table browser data.
3. Write failing API tests for HTTP 200 two-direction `ABSENT`, lifecycle state, policy/snapshot identity, 400／401／403／404／409／422／503.
4. Implement policy projection and pair-state endpoint with server-side filtering.
5. Capture `EXPLAIN QUERY PLAN`, cold/hot samples and payload size.

### Task 4: Implement atomic pair WIP and Save Draft lifecycle

**Files:**

- Modify: `apps/ssi-service/src/app/rma/rma-application.service.ts`
- Modify: `apps/ssi-service/src/app/rma/rma.repository.ts`
- Modify: `apps/ssi-service/src/app/rma/rma.controller.ts`
- Test: `apps/ssi-service/src/app/rma/rma-application.service.spec.ts`

**Steps:**

1. Write failing tests for atomic multi-direction WIP acquisition and rollback on conflict.
2. Write failing tests for WIP／DRAFT／PENDING_APPROVAL／APPROVED-open conflicts and five-minute expiry.
3. Write failing tests for transactional pair Save Draft, first-direction injected failure rollback, unchanged zero-write and idempotent replay／payload mismatch.
4. Write failing tests that clearing an existing direction requires explicit SUPPRESSED.
5. Implement the minimum repository transaction and application policies.
6. Run focused lifecycle and SQLite integration tests.

### Task 5: Implement the generic directional matrix renderer

**Files:**

- Create: `apps/ssi-portal/src/app/resolution-workbench/directional-matrix-select.component.ts`
- Create: `apps/ssi-portal/src/app/resolution-workbench/directional-matrix-select.component.html`
- Create: `apps/ssi-portal/src/app/resolution-workbench/directional-matrix-select.component.css`
- Modify: `apps/ssi-portal/src/app/resolution-workbench/generic-parameter-form.component.ts`
- Modify: `apps/ssi-portal/src/app/resolution-workbench/generic-parameter-form.component.html`
- Modify: `apps/ssi-portal/src/app/resolution-workbench/parameter-model.mapper.ts`
- Test: Generic UI acceptance and component tests under `apps/ssi-portal/src/app/resolution-workbench/`

**Steps:**

1. Write failing synthetic non-RMA Open／Closed renderer test.
2. Write failing tests for shared catalogue parity, search, tabs, independent check state and applicability.
3. Write failing tests for local Reset／×／Esc／backdrop rollback with zero WIP calls.
4. Write failing accessibility tests for tab semantics, checkbox labels, focus trap／return and 48×48 close.
5. Implement the generic renderer without RMA／Message-family branches or description tables.
6. Run focused Angular tests and typecheck.

### Task 6: Bind the approved popup to RMA ADD／EDIT／VIEW／Audit

**Files:**

- Modify: `apps/ssi-portal/src/app/swift-data-crud.component.ts`
- Modify: `apps/ssi-portal/src/app/swift-data-crud.component.html`
- Modify: `apps/ssi-portal/src/app/swift-data-crud.component.css`
- Modify: `apps/ssi-portal/src/app/audit-presentation.ts`
- Test: `apps/ssi-portal/src/app/component-behavior.spec.ts`
- Test: `apps/ssi-portal/src/app/swift-data-crud.component.spec.ts`
- Test: `apps/ssi-portal/src/app/audit-presentation.spec.ts`

**Steps:**

1. Write failing ADD tests for neither／one／both directions and existing-side read-only behavior.
2. Write failing EDIT tests for original values, per-direction deltas, staged summaries and stale policy/version.
3. Write failing VIEW／Audit tests using recorded policy SHA and retired read-only values.
4. Implement popup opening and typed staging while keeping outer Save Draft as persistence boundary.
5. Preserve Index first-two-plus-ellipsis behavior and add regression coverage.

### Task 7: Complete acceptance, performance and Browser evidence

**Files:**

- Evidence: `tmp/rma-directional-selector-acceptance/`

**Steps:**

1. Run focused service, contract and portal tests.
2. Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` and `npm audit --audit-level=high`.
3. Run the complete RMA-SEL-001..042 acceptance matrix against the same code, OAS, policy, fixture and DB snapshot identities.
4. Browser-verify ADD／EDIT／VIEW, INBOUND-left／OUTBOUND-right, the three categories, accessibility, 1024px behavior, compact Index and Cancel semantics.
5. Record before／after DB SHA, query plan, cold/hot metrics, payload, screenshots and audit IDs.
6. Obtain independent QA and DBA acceptance; report completion only when every required gate passes.
