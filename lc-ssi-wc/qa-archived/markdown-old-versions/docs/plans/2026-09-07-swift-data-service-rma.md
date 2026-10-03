# SWIFT DATA Service／RMA Implementation Plan

> **For Codex:** Execute this plan task-by-task with TDD and validation after every change.

**Goal:** 將現有 SSI Service 擴充為參數驅動的 SWIFT DATA Service，在同一 SQLite 內以獨立 Aggregate 管理 SSI 與 RMA，提供 OAS、JSON upload/update、Maker／Checker、audit/outbox，以及 Tag Lab 的 RMA fail-closed gate。

**Architecture:** 保留既有 `/api/ssis` 相容性，在同一 NestJS deployable 中新增 RMA Domain／Application／Repository／Controller。SSI 與 RMA 分開資料表、狀態機與稽核事件。Portal 經 BFF 使用 API；不得直接存取 SQLite。Upload 先驗證全檔，再逐列回報，SSI 只建立 DRAFT，RMA 只建立 DRAFT，禁止 upload 直接 ACTIVE。

**Tech Stack:** Angular、Formly、Web Components、NestJS／Node.js、SQLite、OpenAPI 3.1、Jest、Playwright、ESLint、SonarQube。

---

### Task 1: Design-first OAS 3.1 contract

**Files:**
- Create: `openapi/swift-data-service.v1.yaml`
- Create: `openapi/examples/rma-upload.synthetic.json`
- Create: `openapi/examples/ssi-upload.synthetic.json`

**Steps:**
1. Define SSI compatibility paths and new RMA paths: list/create/update/submit/approve/activate/revoke/check.
2. Define `POST /api/swift-data/imports` with `dataType`, `fileName`, `checksum`, `records`, `dryRun`, `idempotencyKey`.
3. Define schemas, enums, ISO 9362 BIC pattern, pagination, per-row import result and error model.
4. Mark all examples `SYNTHETIC_DEMO`; document that RMA is authorisation, not settlement instruction.
5. Validate YAML/OpenAPI structure with the locally available parser.

### Task 2: Parameter-driven RMA model and policy

**Files:**
- Create: `parameters/rma-rules.sr2026.json`
- Create: `apps/ssi-service/src/app/rma/rma.types.ts`
- Create: `apps/ssi-service/src/app/rma/rma-policy.ts`
- Test: `apps/ssi-service/src/app/rma/rma-policy.test.ts`

**Steps:**
1. Write failing tests for BIC, direction, service, message scope, validity dates and status transitions.
2. Implement `RmaPolicy` with no I/O and immutable results.
3. Require key `ownBic + counterpartyBic + service + direction + messageType`.
4. Return explicit `AUTHORISED`, `NOT_AUTHORISED`, `EXPIRED`, `NOT_FOUND`, `AMBIGUOUS` decisions.
5. Run targeted Jest tests and typecheck.

### Task 3: SQLite RMA repository, audit and outbox

**Files:**
- Create: `apps/ssi-service/src/app/rma/sqlite-rma.repository.ts`
- Test: `apps/ssi-service/src/app/rma/sqlite-rma.repository.test.ts`

**Steps:**
1. Write repository tests using a temporary SQLite database.
2. Create `rma_authorisation`, `rma_audit_event` and shared outbox events in one transaction.
3. Implement parameterised SQL only; no interpolated values.
4. Enforce optimistic version checks and natural-key uniqueness for non-revoked records.
5. Verify rollback leaves no partial audit/outbox rows.

### Task 4: RMA Application Service and REST controller

**Files:**
- Create: `apps/ssi-service/src/app/rma/rma-application.service.ts`
- Create: `apps/ssi-service/src/app/rma/rma.controller.ts`
- Test: `apps/ssi-service/src/app/rma/rma-application.service.test.ts`
- Modify: `apps/ssi-service/src/app/app.module.ts`

**Steps:**
1. Test Maker cannot approve their own RMA and ACTIVE records cannot be edited in place.
2. Implement DRAFT → PENDING_APPROVAL → APPROVED → ACTIVE; amendment creates a new version.
3. Implement logical REVOKED; never physical-delete evidence.
4. Implement paginated filtering and `POST /rma-authorisations/check`.
5. Register controller/providers and run service tests.

### Task 5: Validated SSI／RMA JSON upload service

**Files:**
- Create: `apps/ssi-service/src/app/imports/swift-data-import.service.ts`
- Create: `apps/ssi-service/src/app/imports/swift-data-import.controller.ts`
- Test: `apps/ssi-service/src/app/imports/swift-data-import.service.test.ts`

**Steps:**
1. Test file-size/row-count/checksum/idempotency/duplicate/invalid-row behavior.
2. Implement dry-run with no mutation.
3. Implement accepted upload as DRAFT-only using the SSI or RMA Application Service.
4. Return row number, source key, status, code and message for every record.
5. Write `SWIFT_DATA_IMPORT_ACCEPTED/REJECTED` outbox evidence without storing raw sensitive account values in logs.

### Task 6: BFF contract pass-through

**Files:**
- Modify: `apps/ssi-bff/src/main.ts`
- Test: `apps/ssi-bff/src/rma-bff.test.ts`

**Steps:**
1. Add RMA CRUD/lifecycle/check routes.
2. Add SWIFT DATA upload route with request-size limit and stable error translation.
3. Preserve upstream HTTP status instead of converting every domain error to 502.
4. Test unreachable upstream, validation error and successful pass-through.

### Task 7: Synthetic SSI and RMA samples for all Demo combinations

**Files:**
- Create: `fixtures/swift-data-combination-matrix.json`
- Create: `fixtures/rma-authorisations.seed.json`
- Modify: `scripts/seed-demo-ssis.mjs`
- Create: `scripts/seed-demo-rma.mjs`
- Create: `scripts/verify-demo-coverage.mjs`

**Steps:**
1. Map all 14 business modules to 2–5 reusable SSI candidates without duplicating SSI per message.
2. Generate RMA entries for each Demo BIC/service/direction/message scope used by executable scenarios.
3. Seed exclusively through BFF APIs and normal Maker／Checker／Activate transitions.
4. Make scripts idempotent and reject real-looking account data.
5. Verify every module has 2–5 Active SSI and every executable Outgoing scenario has exactly one effective RMA decision.

### Task 8: Angular RMA maintenance and upload UI

**Files:**
- Create: `apps/ssi-portal/src/app/rma/rma.types.ts`
- Create: `apps/ssi-portal/src/app/rma/rma-api.service.ts`
- Create: `apps/ssi-portal/src/app/rma/rma-workbench.component.ts`
- Modify: `apps/ssi-portal/src/app/app.component.ts`
- Modify: `apps/ssi-portal/src/app/app.component.html`
- Modify: `apps/ssi-portal/src/styles.css`

**Steps:**
1. Add `SWIFT DATA／RMA` navigation and paginated matrix.
2. Add Maker create/edit, Checker approve, Activate, revise and logical revoke actions.
3. Add JSON file picker, dry-run preview and per-row upload result table.
4. Use parameter-driven selects for service/direction/status/message scope and BIC picker integration.
5. Provide loading, empty, error and success states with accessible labels/focus.

### Task 9: RMA gate in MT／MX Tag Lab

**Files:**
- Modify: `apps/ssi-portal/src/app/app.component.ts`
- Modify: `apps/ssi-portal/src/app/app.component.html`
- Test: `staging_ui/verify-tag-lab-e2e.mjs`

**Steps:**
1. Display Selected SSI, canonical agent chain and RMA decision separately.
2. Before Outgoing Generate, call RMA check using selected counterparty BIC/message/direction.
3. Disable generation for NOT_AUTHORISED/EXPIRED/NOT_FOUND/AMBIGUOUS.
4. Display mapping roles used, unused and missing; never alias one BIC to unrelated roles silently.
5. Keep Reference-only messages non-executable.

### Task 10: Quality gates and evidence

**Files:**
- Create: `sonar-project.properties`
- Modify: `package.json`
- Create: `docs/SWIFT_DATA_SERVICE_DEMO_GUIDE_ZH.md`

**Steps:**
1. Run `npm run lint` and all Nx typechecks.
2. Run unit/integration tests with line and branch coverage >95% for new RMA/import modules.
3. Run Playwright flows for upload, Maker/Checker, RMA gate, executable MT400 and Reference-only MT700.
4. Run production builds for Portal, BFF and SWIFT DATA Service.
5. Generate a final evidence report with exact commands, outputs and known Prototype limitations.

## Decision Log

- RMA and SSI share one Prototype deployable/SQLite but remain separate aggregates and tables.
- Existing SSI API remains backward compatible.
- Upload never bypasses Maker／Checker or directly creates ACTIVE data.
- SSI records are reusable across compatible messages; samples are not multiplied per MT/MX combination.
- RMA is mandatory for executable Outgoing SWIFT generation and is fail-closed.
- Public BIC examples may be recognisable, but all accounts, SSI routes and RMA records are synthetic.
