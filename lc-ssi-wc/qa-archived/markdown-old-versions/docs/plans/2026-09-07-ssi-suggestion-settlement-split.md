# SSI Suggestion and Settlement Resolution Split Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split reference-only FIN 5x tag assistance from executable MT/MX settlement resolution while keeping one canonical SSI routing core and removing business taxonomy selection from the SSI UI.

**Architecture:** The SSI domain continues to own governed standing routes, eligibility, canonical settlement roles, and confirmed immutable snapshots. A reference-only application policy exposes FIN tag suggestions that can never issue a payment token; executable settlement endpoints resolve and confirm message-neutral routes that downstream versioned mappers can render as MT or MX. Business function and payment-leg context remain required API inputs supplied by the upstream transaction system, but are read-only or hidden in the SSI portal.

**Tech Stack:** Angular, NestJS, TypeScript, Nx, SQLite demo repositories, OpenAPI, Playwright browser scripts.

---

### Task 1: Lock the contracts with failing tests

**Files:**
- Modify: `scripts/exercise-all-apis.mjs`
- Create: `scripts/e2e-suggestion-settlement-split.mjs`
- Modify: `scripts/e2e-swift-data.mjs`

**Steps:**
1. Add an API test for `POST /reference/fin-tag-suggestions` that expects `usage=REFERENCE_ONLY`, `paymentExecutable=false`, no resolution token/hash, provenance for each suggested 5x tag, and rejection of MX input.
2. Add settlement tests proving `/settlements/resolve` and `/settlements/{resolutionId}/confirm` accept canonical MT/MX contexts, and only confirm returns an immutable token/hash after hard controls.
3. Add negative tests proving LC/SBLC opening, advice, amendment, and unapproved claim contexts return `PAYMENT_TRIGGER_REQUIRED` for executable settlement.
4. Add browser tests for the two separate sidebar functions and absence of editable business category/module/function selectors.
5. Run the targeted scripts and confirm they fail before implementation.

### Task 2: Add the reference-only FIN tag suggestion policy

**Files:**
- Modify: `apps/ssi-service/src/app/message-semantic.service.ts`
- Modify: `apps/ssi-service/src/app/app.controller.ts`
- Modify: `apps/ssi-bff/src/main.ts`
- Modify: `openapi/swift-data-service.v1.json`
- Modify: `apps/ssi-portal/public/openapi/swift-data-service.v1.json`

**Steps:**
1. Add a request contract keyed by FIN service, standards release, exact MT type, direction, sequence/payment-leg identifier, routing context, currency, counterparty and transaction reference.
2. Resolve message-specific semantic roles before consulting SSI; never use tag number alone as the role key.
3. Return only supported 53a–58a suggestions with canonical role, value, source, confidence/evidence, `usage=REFERENCE_ONLY`, `paymentExecutable=false`, and `NOT FOR PAYMENT RELEASE` watermark.
4. Ensure the reference endpoint cannot create a resolution token, immutable payment snapshot, or release-eligible decision.
5. Keep existing extract/generate endpoints as backward-compatible adapters where needed and mark them deprecated in the OAS.
6. Run lint and service/BFF typechecks.

### Task 3: Normalize executable settlement endpoints

**Files:**
- Modify: `apps/ssi-service/src/app/app.controller.ts`
- Modify: `apps/ssi-service/src/app/route-resolution.policy.ts`
- Modify: `apps/ssi-service/src/app/ssi-application.service.ts`
- Modify: `apps/ssi-bff/src/main.ts`
- Modify: both OpenAPI copies

**Steps:**
1. Expose canonical `/settlements/resolve` and `/settlements/{resolutionId}/confirm` routes while retaining compatibility aliases for current `/resolve` calls.
2. Keep hard applicability on upstream-supplied consumer, product, business function, payment leg, direction, currency and value date.
3. Return message-neutral canonical agents, settlement account, clearing system and actual receiver BIC.
4. On confirm, recheck SSI version/effective period, applicability, Nostro/entity authorization, actual-receiver RMA and governed clearing compatibility.
5. Return `usage=EXECUTABLE_SETTLEMENT`, `paymentExecutable=true`, confirmed timestamp, resolution token and snapshot hash only after all checks pass.
6. Preserve existing fail-closed decisions and audit evidence.
7. Run lint, service tests and typechecks.

### Task 4: Split and simplify the portal functions

**Files:**
- Modify: `apps/ssi-portal/src/app/app.component.ts`
- Modify: `apps/ssi-portal/src/app/app.component.html`
- Modify: `apps/ssi-portal/src/styles.css`

**Steps:**
1. Rename the reference workspace/navigation to `MT 5x Tag Suggestion` and keep `SSI Settlement Resolution` as a separate function.
2. In Suggestion, select an exact MT message/scenario and show only suggested tags, semantic roles, evidence and the not-for-payment watermark.
3. In Settlement Resolution, remove editable business category/module/function controls; show upstream transaction context as a compact read-only summary or controlled demo preset.
4. Keep transaction criteria needed by the operator: counterparty, currency, booking branch, value date and amount, with advanced overrides only when authorized.
5. Display confirmed canonical roles and their MT/MX render preview without letting the UI re-resolve differently for each format.
6. Preserve high-contrast notices, loading/error states, keyboard accessibility and existing responsive behavior.
7. Run portal lint, typecheck, build and browser E2E.

### Task 5: Verify mapping boundaries and compatibility

**Files:**
- Modify: `scripts/verify-supported-routing-matrix.mjs`
- Modify: `scripts/e2e-suggestion-settlement-split.mjs`
- Modify: `package.json`

**Steps:**
1. Verify reference suggestions for representative MT4 and MT7 contexts without payment tokens.
2. Verify executable MT1/MT2, approved MT3 cash legs and pacs.008/pacs.009 CORE/COV settlement contexts use the same confirmed canonical route snapshot.
3. Verify non-payment MT4/MT7 contexts cannot enter executable settlement; approved collection/reimbursement/claim payment legs can.
4. Verify message generation consumes the confirmed snapshot and cannot consume an unconfirmed suggestion response.
5. Run `npm run lint`, `npm run typecheck`, targeted tests, all builds, routing matrix, browser E2E, `npm run verify`, `npm audit --audit-level=high`, and `git diff --check`.
6. Record the production boundary: SR2026 field presence and live reachability/cut-off require licensed Swift/MyStandards and scheme-directory integrations.
