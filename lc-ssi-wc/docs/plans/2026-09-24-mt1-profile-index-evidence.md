# MT1 Profile Index and Dual Evidence Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use tdd-orchestrator to implement this plan task-by-task.

**Goal:** Present MT103 Base, STP, and REMIT as separate Payment SSI Index rows, sort Payment rows by MT message, and return governed evidence-only MT/MX projections for Base and STP while keeping REMIT MT-only.

**Architecture:** Add explicit counterpart/output policy to the controlled MT1 OAS profile metadata and project it through the existing Page Definition and generic Index/result contracts. Resolve one canonical atomic SSI route, then render governed MT and/or ISO 20022 evidence projections from that same route and snapshot; never generate a payment message. Keep profile order and MT sort server-authoritative and use the existing generic Angular components.

**Tech Stack:** TypeScript 6, NestJS, Angular 22, Jest/Nx, JSON OpenAPI extensions.

---

### Task 1: Codify the profile pairing and evidence-only decision

**Files:**

- Modify: `memory/swift-mt1xx-pacs008-ssi-v3.md`
- Modify: `memory/mt1/MT1_PACS008_SSI_RESOLUTION_SCOPE_CONTEXT_CONTRACT_v1_DRAFT.md`
- Modify: `memory/mt1/MT1_PACS008_SETTLEMENT_CONTEXT_SSI_ROLE_ATOMIC_ROUTE_MATRIX_v1_DRAFT.md`
- Modify: `openapi/swift-data-service.v1.json`
- Modify: `apps/ssi-portal/public/openapi/swift-data-service.v1.json`

1. Record Base↔plain, STP↔STP and REMIT→MT-only as SSI evidence projection policy.
2. State `payloadGenerated=false`, one route/snapshot, no conversion or customer/payment payload.
3. Add exact counterpart profile and output-format metadata to each controlled profile.
4. Validate both OpenAPI copies remain identical JSON.

### Task 2: Drive the Index contract with failing tests

**Files:**

- Modify: `apps/ssi-service/src/test/app/mt1-ssi-profile.registry.spec.ts`
- Modify: `apps/ssi-service/src/test/app/page-parameters/mt1-ssi-resolution-page-definition.source.spec.ts`
- Modify: `apps/ssi-service/src/test/app/page-parameters/resolution-page-aggregation.service.spec.ts`
- Modify: `apps/ssi-portal/src/test/app/resolution-workbench/page-definition-index.spec.ts`

1. Add RED assertions for explicit profile pairing/output policy.
2. Add RED assertions for three separate MT103 Index groups with governed generated fields.
3. Add RED assertions for default MT numeric/profile order: Base, STP, REMIT, then MT202/MT202COV/MT205/MT205COV.
4. Run focused tests and preserve the expected failures.

### Task 3: Implement profile-driven Index projection

**Files:**

- Modify: `apps/ssi-service/src/app/mt1-ssi-profile.registry.ts`
- Modify: `apps/ssi-service/src/app/page-parameters/mt1-ssi-resolution-page-definition.source.ts`
- Modify: `apps/ssi-service/src/app/page-parameters/resolution-page-aggregation.service.ts`
- Modify: `libs/contracts/src/page-parameters.ts`
- Modify: `apps/ssi-portal/src/app/resolution-workbench/page-definition-index.ts`
- Modify: `apps/ssi-portal/src/app/resolution-workbench/page-definition-index-table.component.html`

1. Project controlled profile identity/order and MT/MX evidence capability from OAS.
2. Group MT103 by profile, not only message type; retain generic grouping for other messages.
3. Publish native MT Tag slots and native MX element slots without inventing MT options for MX.
4. Apply stable server-authoritative MT numeric/profile ordering with a unique tie-breaker.
5. Run focused service/portal tests, lint, and typecheck.

### Task 4: Drive dual evidence and corrected SSI semantics with failing tests

**Files:**

- Modify: `apps/ssi-service/src/test/app/mt1-ssi-demo-route.repository.spec.ts`
- Modify: `apps/ssi-service/src/test/app/page-parameters/mt1-ssi-resolution-page-submission.adapter.spec.ts`
- Modify: `apps/ssi-portal/src/test/app/resolution-workbench/new-code-components.spec.ts`

1. Add RED tests for Base MT+plain-MX evidence and STP MT+STP-MX evidence.
2. Add RED test that REMIT returns MT-only evidence.
3. Assert all evidence shares one route binding/snapshot and `payloadGenerated=false`.
4. Add assertions for INDA ownership, separate `SttlmMtd`/account projections, valid COVE owner/servicer boundaries, canonical roles, and no RMA/CPI output.

### Task 5: Implement canonical route projections and generic result rendering

**Files:**

- Modify: `parameters/mt1-ssi-demo-routes.sr2026.json`
- Modify: `apps/ssi-service/src/app/mt1-ssi-demo-route.repository.ts`
- Modify: `apps/ssi-service/src/app/page-parameters/mt1-ssi-resolution-page-submission.adapter.ts`
- Modify: `apps/ssi-portal/src/app/resolution-workbench/resolution-result.presenter.ts`
- Modify: `apps/ssi-portal/src/app/resolution-workbench/resolution-result-table.component.html`

1. Build profile-governed MT and MX projections from one canonical route.
2. Fail closed on missing pairing/option/topology metadata.
3. Correct INDA/INGA ownership and COVE boundaries; separate MX agent/account elements.
4. Render official field description and canonical role in the shared result table.
5. Keep output explicitly labelled Resolution Evidence and never Generated Messages.
6. Run focused tests, lint, and typecheck.

### Task 6: Verify, scan, and prepare exact-commit review

**Files:**

- Update only generated local evidence under ignored `tmp/` or the existing local QA evidence location; do not stage unrelated MT2 scanner output.

1. Run affected tests and `npm run verify`.
2. Run browser E2E for all three MT103 profiles and paired Base/STP evidence.
3. Commit only intended files on `mt1_series`; do not push.
4. Run Sonar with the ARM64 scanner image against the exact commit.
5. Request independent BA and QA review of the same exact commit and report any remaining Gate failure honestly.
