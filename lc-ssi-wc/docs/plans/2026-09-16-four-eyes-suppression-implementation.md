# Four-Eyes Suppression Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. The sub-skill is unavailable in this environment, so execute the same TDD checkpoints directly.

**Goal:** Replace direct Active-record revocation with a versioned Maker–Checker suppression workflow shared by RMA, Entities, Nostro and SSI.

**Architecture:** Reuse the existing governed revision records and open-revision metadata. A suppression request is a new DRAFT version with `changeType: "SUPPRESSION"`; submit and reject use the existing transition path, while approval atomically publishes the SUPPRESSED version and supersedes the former Active version. UI actions remain resource-agnostic and are driven by the shared lifecycle contract.

**Tech Stack:** Angular, NestJS, TypeScript, SQLite, Jest, Nx.

---

### Task 1: Domain and repository contract

**Files:**
- Modify: `apps/ssi-service/src/app/shared/sqlite-governed.repository.ts`
- Modify: `apps/ssi-service/src/app/sqlite-ssi.repository.ts`
- Test: `apps/ssi-service/src/app/sqlite-repositories.spec.ts`

1. Write failing tests proving only one open suppression revision can be reserved atomically.
2. Run the repository tests and retain the RED result.
3. Add `changeType`, suppression reason and open-revision metadata without introducing resource-specific tables.
4. Run tests and require PASS.

### Task 2: Shared governed resource services

**Files:**
- Modify: `apps/ssi-service/src/app/shared/governed-lifecycle-controller.delegate.ts`
- Modify: `apps/ssi-service/src/app/rma/rma-application.service.ts`
- Modify: `apps/ssi-service/src/app/entity/entity-application.service.ts`
- Modify: `apps/ssi-service/src/app/nostro/nostro-application.service.ts`
- Test: corresponding `*.spec.ts` files

1. Write failing tests for Active → suppression DRAFT → PENDING_APPROVAL.
2. Write failing tests for same-actor rejection and stale/duplicate suppression requests.
3. Implement a shared suppression transition helper.
4. Approve by writing the latest version as SUPPRESSED and superseding the previous Active version in one transaction boundary.
5. Run all governed service tests.

### Task 3: SSI service workflow

**Files:**
- Modify: `apps/ssi-service/src/app/ssi-application.service.ts`
- Modify: `apps/ssi-service/src/app/ssi.controller.ts`
- Test: `apps/ssi-service/src/app/ssi-application.service.spec.ts`

1. Write failing tests for reason validation, four-eyes enforcement, duplicate request conflict and final status.
2. Add `POST /ssis/:id/suppress`, reusing revision reservation and lifecycle rules.
3. Ensure resolution continues to select only ACTIVE records before approval and excludes SUPPRESSED afterwards.
4. Run SSI service tests.

### Task 4: API/BFF contract

**Files:**
- Modify: `apps/ssi-bff/src/main.ts`
- Modify: `openapi/swift-data-service.v1.json`
- Modify: `apps/ssi-portal/public/openapi/swift-data-service.v1.json`

1. Add forwarding routes and schema fields for suppression reason/change type.
2. Remove direct Active revoke from normal lifecycle metadata while retaining legacy read compatibility.
3. Validate both OpenAPI copies remain identical.

### Task 5: Shared UI lifecycle

**Files:**
- Modify: `apps/ssi-portal/src/app/swift-data-crud.component.ts`
- Modify: `apps/ssi-portal/src/app/swift-data-crud.component.html`
- Modify: `apps/ssi-portal/src/app/app.component.ts`
- Modify: `apps/ssi-portal/src/app/app.component.html`
- Test: `apps/ssi-portal/src/app/component-behavior.spec.ts`

1. Write failing UI tests for `Suppress`, mandatory reason, Draft/Edit/Submit, and Checker counter refresh.
2. Replace Active `Revoke` with `Suppress`; keep legacy revoked records read-only.
3. Display suppression work in Revision Status and separate titled action columns.
4. Ensure stale 409 responses refresh rows, totals and Checker badge.
5. Run portal tests.

### Task 6: End-to-end validation

1. Run service, BFF and portal typechecks.
2. Run lint and affected/full Jest suites.
3. Run `npm run verify` required by governance.
4. Use the browser to verify Maker suppression, Submit, Checker detail, Reject and Approve paths without full-table downloads.
5. Record any intentionally retained legacy ACTIVATE/REVOKED compatibility endpoints.

