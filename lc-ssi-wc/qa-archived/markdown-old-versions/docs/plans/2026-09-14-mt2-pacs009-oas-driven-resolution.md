# MT2 and pacs.009 OAS-Driven Resolution Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: use the available acceptance-orchestrator workflow to implement this plan task-by-task; the referenced executing-plans skill is not installed in this workspace.

**Goal:** Rebuild exactly four executable Payment Index messages—MT202, MT202COV, MT205, and MT205COV—on the same server-governed page-definition and acceptance model used by MT3/4/7, while retaining the current MT2/pacs.009 resolver as the behavior oracle.

**Architecture:** Add a PAYMENT business domain and a governed MT2/pacs.009 page-definition source beside the existing MT347 source, then expose both through a composite source. Route generic page submissions for PAYMENT definitions through the existing settlement-resolution application service and adapt its MT/MX result into the generic execution contract. Switch the Payment UI to the generic index/workbench only after contract, execution, browser, and regression evidence passes.

**Tech Stack:** NestJS, Angular, TypeScript, Jest, Playwright, OpenAPI 3, JSON governed parameters, SQLite test fixtures.

---

### Task 1: Add the PAYMENT page-definition domain

**Files:**
- Modify: `libs/contracts/src/page-parameters.ts`
- Modify: `apps/ssi-service/src/app/page-parameters/resolution-page-definition.controller.ts`
- Modify: `apps/ssi-portal/src/app/resolution-workbench/page-definition-index-workspace.component.ts`
- Test: `apps/ssi-service/src/app/page-parameters/resolution-page-definition.controller.spec.ts`
- Test: `apps/ssi-portal/src/app/resolution-workbench/page-definition-index-workspace.component.spec.ts`

1. Write failing tests proving `PAYMENT` is accepted and remains domain-isolated.
2. Run the focused tests and confirm the current two-domain restriction fails.
3. Extend the shared domain union and server/client domain labels without weakening validation.
4. Run lint, typecheck, and the focused tests.

### Task 2: Publish governed MT2/pacs.009 page definitions

**Files:**
- Create: `parameters/resolution-page-scenarios.mt2-pacs009.sr2026.json`
- Create: `apps/ssi-service/src/app/page-parameters/payment-resolution-page-definition.source.ts`
- Create: `apps/ssi-service/src/app/page-parameters/payment-resolution-page-definition.source.spec.ts`
- Create: `apps/ssi-service/src/app/page-parameters/composite-resolution-page-definition.source.ts`
- Modify: `apps/ssi-service/src/app/app.module.ts`
- Modify: `openapi/swift-data-service.v1.json`
- Modify: `apps/ssi-portal/public/openapi/swift-data-service.v1.json`

1. Write failing contract tests for MT202, MT202COV, MT205, and MT205COV.
2. Derive every scenario from controlled SWIFT MT2 MRG, pacs.009 plain/COV Usage Guideline, and applicable NVR evidence.
3. Require explicit `BizSvc` selection for plain versus COV although both target `pacs.009.001.08`.
4. Publish Operational and QA-only scenarios under each of the four messages; scenario count is rule-driven rather than fixed at four.
5. Apply display order Positive=0, Negative=1, Boundary=2 within the governed scenario catalogue.
6. Mark NVR rules with `UPSTREAM_FIN_VALIDATOR`; report `NOT_EVALUATED` unless executable validator evidence exists.
7. Keep the executable Index to exactly MT202, MT202COV, MT205, and MT205COV.
8. Publish transaction inputs before SSI-derived outputs, including SWIFT sequence/tag/option metadata.
9. Keep MT200, MT201, MT203, MT204, and MT210 outside the executable SSI Resolver Index and fail-closed at the API boundary.
10. Validate both OpenAPI copies and run focused service tests.

### Task 3: Execute PAYMENT submissions through the existing resolver

**Files:**
- Create: `apps/ssi-service/src/app/page-parameters/payment-resolution-page-submission.adapter.ts`
- Create: `apps/ssi-service/src/app/page-parameters/payment-resolution-page-submission.adapter.spec.ts`
- Modify: `apps/ssi-service/src/app/page-parameters/resolution-page-submission.adapter.ts`
- Modify: `libs/contracts/src/page-parameters.ts`

1. Write failing tests for plain, COV, own-account, upstream-context, no-route, and invalid-profile cases.
2. Translate governed page values into the existing MT2 settlement request contract.
3. Reuse the existing resolver and data-quality gates; do not duplicate ranking or SSI logic.
4. Adapt MT tags and pacs.009 roles/elements into generic field results with evidence identity.
5. Assert no payload, confirmation, or repair queue is created for rejected cases.
6. Run focused lint, typecheck, unit, and integration tests.

### Task 4: Replace the Payment UI entry with the generic workbench

**Files:**
- Modify: `apps/ssi-portal/src/app/app.component.html`
- Modify: `apps/ssi-portal/src/app/app.component.ts`
- Modify: `apps/ssi-portal/src/app/resolution-workbench/resolution-workbench.css`
- Test: `apps/ssi-portal/src/app/resolution-workbench/generic-ui.acceptance.spec.ts`
- Test: `apps/ssi-portal/src/app/component-behavior.spec.ts`

1. Write failing tests for Payment index, Operational/QA tabs, scenario order, mandatory inputs, SWIFT labels, dependent resets, spinner, Cancel, and result dialog.
2. Render the PAYMENT domain with the generic index/workbench.
3. Clear stale Counterparty and downstream selections on currency/value-date changes and show loading state until governed choices return.
4. Keep derived SSI fields below user inputs and make tag/option plus BIC visually prominent.
5. Remove only unreachable legacy Payment presentation after behavior parity is proven.
6. Run Angular lint, typecheck, component tests, and production build.

### Task 5: Rebuild MT2/pacs.009 acceptance evidence

**Files:**
- Modify: `qa/tests/mt2/final/ui-journeys.json`
- Create: `qa/user_guide/MT2-PACS009-OPERATIONAL-INPUT-GUIDE.md`
- Create: `scripts/mt2-final-qa/run-generic-payment-browser-matrix.mjs`
- Modify: `scripts/mt2-final-qa/run.mjs`

1. Cover every executable message, Operational scenario, QA negative/boundary scenario, eligible currency, and SSI Counterparty fixture.
2. Compare MT output, pacs.009 output, BizSvc, sequence/option semantics, NVR ownership/outcome, and evidence hashes to controlled expectations.
3. Preserve MT2/pacs.009 round-trip and MT3/4/7 regression evidence.
4. Record PASS, FAIL, and NOT_EXECUTED honestly; no synthetic pass substitution.

### Task 6: Final acceptance and freeze readiness

1. Run `npm run verify`.
2. Run `npm audit --audit-level=high` and record remaining upstream moderate risks separately.
3. Run the local SonarQube scan and enforce Blocker=0, Critical=0, Major=0, Minor<20.
4. Run MT2/pacs.009 browser UAT plus the MT3/4/7 regression manifest.
5. Publish final evidence and report status as accepted only when every criterion has fresh proof.
