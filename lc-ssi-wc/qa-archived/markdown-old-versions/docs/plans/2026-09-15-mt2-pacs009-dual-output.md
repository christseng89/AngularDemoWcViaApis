# MT2 / pacs.009 Dual Output Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use acceptance-orchestrator and tdd-orchestrator to implement this plan task-by-task.

**Goal:** Reorganise the MT2 / pacs.009 SSI flow so OAS governs page inputs and the server returns both MT and pacs.009 representations from one canonical SSI resolution for generic UI display.

**Architecture:** Extend the shared Page Parameters execution contract with generic generated-output metadata. The Payment submission adapter maps the existing server-owned `mt` and `mx` resolution objects into those outputs; Angular renders the returned metadata without message-specific rules or client-side conversion. Picker and resolve requests share one governed eligibility snapshot identity.

**Tech Stack:** OpenAPI 3.x JSON, TypeScript 6, NestJS 11, Angular 22, Jest 30, Nx 23.

---

### Task 1: Lock the OAS and shared contract with RED tests

**Files:**

- Modify: `libs/contracts/src/page-parameters.ts`
- Modify: `openapi/swift-data-service.v1.json`
- Modify: `apps/ssi-portal/public/openapi/swift-data-service.v1.json`
- Test: `apps/ssi-service/src/app/page-parameters/validation-scope.contract.spec.ts`
- Test: `apps/ssi-service/src/app/page-parameters/payment-ssi-route-ui.acceptance.spec.ts`

**Steps:**

1. Add failing assertions for generic MT and ISO 20022 generated-output schemas.
2. Add failing assertions that picker and resolve both require the same eligibility snapshot identity.
3. Run focused tests and capture RED.
4. Add the minimal shared types and identical OpenAPI schemas.
5. Run focused tests and confirm GREEN.

### Task 2: Map one canonical Payment resolution to two outputs

**Files:**

- Modify: `apps/ssi-service/src/app/page-parameters/payment-resolution-page-submission.adapter.ts`
- Test: `apps/ssi-service/src/app/page-parameters/payment-resolution-page-submission.adapter.spec.ts`

**Steps:**

1. Add a failing success-path test requiring exactly MT and pacs.009 outputs.
2. Add failing negative-path tests requiring no generated outputs when payload generation is false.
3. Implement a pure mapper from the existing `mt` and `mx` server results.
4. Preserve the resolved-field table and attach both outputs to the same evidence hash/correlation result.
5. Run focused adapter tests and confirm GREEN.

### Task 3: Render server-described outputs in the generic UI

**Files:**

- Create: `apps/ssi-portal/src/app/resolution-workbench/resolution-generated-outputs.component.ts`
- Create: `apps/ssi-portal/src/app/resolution-workbench/resolution-generated-outputs.component.spec.ts`
- Modify: `apps/ssi-portal/src/app/resolution-workbench/resolution-evidence.component.ts`
- Modify: `apps/ssi-portal/src/app/resolution-workbench/resolution-workbench.css`

**Steps:**

1. Add a failing component test for two arbitrary server-described outputs.
2. Implement a generic accessible output viewer with format, message identity, media type and payload.
3. Integrate it into Step 04 without MT202/pacs.009 conditionals.
4. Run focused portal tests and confirm GREEN.

### Task 4: Acceptance, performance and regression validation

**Files:**

- Modify only if required by failing evidence: `qa/mt2/**`, `qa/user_guide/**`

**Steps:**

1. Run focused service and portal suites.
2. Run lint, typecheck and builds for affected projects.
3. Exercise MT202, MT202COV, MT205 and MT205COV in the running UI; verify defaults, SSI-only inputs, one resolve action and both output formats.
4. Verify MT3/4/7 regressions and that non-Payment flows are unaffected.
5. Record PASS/FAIL/NOT_EXECUTED evidence honestly; do not treat out-of-scope full FIN NVR as an SSI gate failure.
