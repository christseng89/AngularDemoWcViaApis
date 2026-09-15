# Purpose-built SSI Resolution Data Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace mechanically generated alternate SSI demo records with governed, purpose-built resolution scenarios that separate counterparty identity, applicability, settlement route, Nostro, and RMA evidence.

**Architecture:** Keep the existing SSI API and Maker–Checker lifecycle for compatibility, but introduce stable `ssiCode`, `applicabilityProfileId`, `settlementRouteId`, route type/preference, typed country roles, actual receiver, and governance metadata within the current route envelope. Treat `ssiCode`—not counterparty plus currency—as the logical version lineage. Seed updates create revisions so audit history remains intact.

**Tech Stack:** Angular 22, NestJS 11, SQLite, Nx, Node.js seed and acceptance scripts.

---

### Task 1: Correct SSI version lineage

**Files:**
- Modify: `apps/ssi-service/src/app/ssi-application.service.ts`
- Test: `apps/ssi-service/src/app/ssi-application.service.spec.ts`

1. Write a test proving two SSI codes for one counterparty/currency may both be ACTIVE.
2. Change activation supersession to match `ssiCode` or direct amendment lineage.
3. Run SSI service tests/typecheck.

### Task 2: Replace mechanical ALT generation

**Files:**
- Modify: `scripts/seed-demo-ssis.mjs`
- Modify: `fixtures/ten-bank-ssi.seed.json`

1. Define explicit primary and secondary clearing/correspondent routes per supported currency.
2. Add stable SSI, applicability, and route identifiers plus route type, preference, actual receiver, country roles, priority, and rationale.
3. Migrate existing Active demo records through revisions using legacy identifiers.
4. Retain 2–5 Active SSI per currency and controlled global fallback only where approved.

### Task 3: Expose governed resolution data

**Files:**
- Modify: `openapi/swift-data-service.v1.json`
- Modify: `apps/ssi-portal/public/openapi/swift-data-service.v1.json`
- Modify: `apps/ssi-portal/src/app/app.component.html`

1. Change the SSI list from ambiguous Counterparty-only display to SSI ID, counterparty matcher, country, currency, account-with, route type, priority, status, and version.
2. Add the new fields to the parameter-driven SSI form and details.
3. Show route type, priority, actual receiver, country/market, and RMA/Nostro evidence in Resolution results.

### Task 4: Verify business scenarios and controls

**Files:**
- Modify: `scripts/verify-supported-routing-matrix.mjs`

1. Assert every purpose-built SSI/message combination resolves and confirms with exact RMA/Nostro evidence.
2. Assert primary ranking, approved global fallback, unsupported message, unapproved market, and missing RMA controls.
3. Run `npm run demo:seed`, `npm run demo:verify-matrix`, `npm run verify`, `npm audit --audit-level=high`, and `git diff --check`.

## Decision Log

- Keep the API envelope to avoid destabilising CRUD and audit flows; introduce explicit governed identifiers now and migrate to typed aggregates incrementally.
- Use stable `ssiCode` for version lineage; counterparty identity never determines whether another route is a revision.
- Replace random bank-offset ALT data with explicitly declared routes and documented purposes.
- Share settlement route building blocks only; keep business applicability and SWIFT/RMA scope explicit.
