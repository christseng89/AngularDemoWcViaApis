# SSI Load Data Repair Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate opaque counterparty IDs from ISO 9362 BICs, prevent invalid SSI/RMA demo loads, and provide a dry-run-first TypeScript API auditor for existing SSI and RMA data.

**Architecture:** The portal keeps `counterpartyId` as a stable internal identifier and stores the bank identity separately in `route.counterpartyBic`. Seed/import validation and the repair auditor share deterministic classification rules; the auditor never changes data by default and never auto-approves revisions, preserving Maker/Checker and the audit trail.

**Tech Stack:** Angular 22, TypeScript 6, NestJS APIs, Node 22 built-in `fetch`, Jest/Nx, OpenAPI.

---

### Task 1: Lock the counterparty ID/BIC contract in the portal

**Files:**

- Modify: `apps/ssi-portal/src/app/app.component.ts`
- Modify: `apps/ssi-portal/src/app/component-behavior.spec.ts`
- Test: `apps/ssi-portal/src/app/ssi-form-presentation.spec.ts`

**Step 1: Write failing tests**

Assert that a Bank Service choice produces `counterpartyId: "CP-CHASUS33"` and `route.counterpartyBic: "CHASUS33"`, and that an existing `CP-BOFAUS3N` remains unchanged during edit.

**Step 2: Run tests to verify the old BIC-only validation fails**

Run: `npx nx test ssi-portal --configuration=ci --runTestsByPath apps/ssi-portal/src/app/component-behavior.spec.ts apps/ssi-portal/src/app/ssi-form-presentation.spec.ts`

Expected: FAIL on the old 8/11-character BIC expectation or missing route BIC.

**Step 3: Implement the identity split**

Use `^[A-Z0-9][A-Z0-9._-]{2,34}$` for the opaque Bank counterparty ID, preserve valid `route.counterpartyBic`, and only derive the BIC from a `CP-` ID when the route value is missing.

**Step 4: Validate**

Run the focused Jest tests, `npx nx typecheck ssi-portal`, and `npx eslint` for the changed files. Expected: PASS.

### Task 2: Add deterministic load-data classification

**Files:**

- Create: `scripts/ssi-counterparty-data-rules.ts`
- Create: `scripts/ssi-counterparty-data-rules.spec.ts`
- Modify: `scripts/seed-demo-ssis.mjs`

**Step 1: Write failing rule tests**

Cover BANK (`CP-BOFAUS3N` + `BOFAUS3N`), ANY_BANK (`CP-ANY-*` + `ANY`), CUSTOMER (opaque ID and no counterparty BIC), invalid BIC, mismatched BIC, and ambiguous records.

**Step 2: Run tests and observe failure**

Run: `node --import ts-node/register --test scripts/ssi-counterparty-data-rules.spec.ts`

Expected: FAIL because the shared rules do not exist.

**Step 3: Implement rules and seed guard**

Return one of `VALID`, `AUTO_FIXABLE`, `AMBIGUOUS`, or `IGNORED_FIXTURE`. Reject invalid new demo seeds before calling the API; do not rewrite opaque IDs into BICs.

**Step 4: Validate**

Run the rule tests and a seed validation-only invocation. Expected: zero invalid purpose-built seeds.

### Task 3: Build the TypeScript API auditor/repair client

**Files:**

- Create: `scripts/audit-repair-ssi-counterparty-data.ts`
- Modify: `package.json`
- Create: `docs/operations/ssi-load-data-repair.md`

**Step 1: Add a dry-run integration test around a stub HTTP server**

Prove pagination, reference-bank lookup, classification, JSON report generation, and that no mutation requests occur without `--apply`.

**Step 2: Implement the API client**

Default to `--dry-run`; page through `/api/ssis`, load `/api/reference/banks`, and emit totals plus per-record reasons. `--apply` may update existing DRAFT records only when the correction is unambiguous; ACTIVE records are reported as `REVISION_REQUIRED` and are never auto-approved.

**Step 3: Add package commands**

Add `demo:audit:ssi-data` for dry run and a separate explicit apply command limited to drafts.

**Step 4: Validate against localhost**

Run the dry-run command against `http://localhost:3100/api`, save the report under `tmp/`, and confirm request logs contain GET only.

### Task 4: Verify the reported Save Draft defect and regression boundary

**Files:**

- Test: `apps/ssi-portal/src/app/component-behavior.spec.ts`
- Test: `scripts/ssi-counterparty-data-rules.spec.ts`

**Step 1: Run focused validation**

Run portal focused tests, repair rule tests, typecheck, and ESLint.

**Step 2: Exercise the UI/API path**

Open `CP-BOFAUS3N`, revise without changing the internal ID, and verify Save Draft accepts the record while the request contains `route.counterpartyBic: "BOFAUS3N"`.

**Step 3: Review the dry-run report**

Confirm auto-fixable, ambiguous, fixture, and revision-required counts. Do not bulk apply ACTIVE corrections until a Maker/Checker-approved remediation decision exists.

### Task 5: Audit RMA fixture and loaded data

**Files:**

- Create: `scripts/rma-load-data-rules.ts`
- Create: `scripts/rma-load-data-rules.spec.ts`
- Modify: `scripts/audit-repair-ssi-counterparty-data.ts`
- Modify: `scripts/seed-swift-data.mjs`

**Step 1: Encode the RMA index contract**

Group by BIC plus `INBOUND`/`OUTBOUND`; merge allowed message types into one index row per direction. Validate Own BIC, counterparty BIC, service, direction, and effective dates.

**Step 2: Filter message types from governed parameters**

Allow only parameter-supported MT1xx, MT2xx, MT3xx, MT4xx, MT7xx and ISO 20022 MX values. Ignore unsupported Load Data entries and include each ignored value and source record in the report.

**Step 3: Detect duplicate and mixed-service records**

Report duplicate BIC/direction rows, split FIN/FINPLUS records that should be presented as one governed bank-direction index, invalid BICs, and unsupported message types. Never infer a service or direction when the source is ambiguous.

**Step 4: Validate against localhost**

Run the TypeScript auditor against both `/api/ssis` and `/api/rma-authorisations`; confirm the output has separate SSI and RMA summaries and performs GET requests only.
