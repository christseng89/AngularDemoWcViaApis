# MT2/pacs.009 Two-Stage SSI UI Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the MT2/pacs.009 cascade of Receiver/Debit/Credit lookups with an OAS-governed two-stage SSI workflow that discovers eligible routes once and resolves the selected/default route once, updating all derived fields atomically.

**Architecture:** The Page Definition exposes only transaction context plus one governed Counterparty/Receiver route selector. Own debit/credit account identities and generated MT/pacs.009 fields remain server-derived. The discovery response owns eligibility, ranking and the default; execute revalidates the selected identity and returns one complete MT/MX result. Angular renders the contract and commits one response snapshot without message-specific decisions.

**Tech Stack:** NestJS, Angular signals/reactive forms, TypeScript contracts, OpenAPI 3, Jest/Nx, Playwright, SQLite governed fixtures.

---

### Task 1: Lock the minimum-input contract (Red)

- Update the Payment acceptance tests so Own Debit/Credit Account controls are `SSI_DERIVED`, hidden and non-required.
- Require exactly one visible Counterparty Bank (Receiver Bank) route selector for own-account scenarios.
- Run the focused service tests and retain the expected failure evidence.

### Task 2: Derive own-account identities server-side (Green)

- Update Payment Page Definition policies; do not add message-specific Angular conditions.
- Select eligible active Nostro debit/credit records in the backend using currency, booking entity, value date, receiver and governed priority.
- Pass pinned ID/version internally to the existing resolver and fail closed for no route or ambiguity.
- Run focused service contract and adapter tests.

### Task 3: Atomic UI state and race protection

- Keep only the single OAS-declared route lookup visible.
- Ensure currency/context changes cancel stale lookup results and replace the visible selection once.
- Render derived accounts and MT/pacs.009 outputs only from the completed execute response.
- Add component tests for rapid currency changes and stale response suppression.

### Task 4: Fixture and all-currency acceptance

- Verify every governed currency has at least three RMA-authorised synthetic eligible routes and aligned Nostro data.
- Add missing synthetic data through controlled parameters/seed, never UI fallback.
- Run all 4 messages x 17 scenarios and currency-transition tests.

### Task 5: Quality and Four-eyes gates

- Run lint, typecheck, focused tests, full `npm run verify`, browser UAT and current-source SonarQube.
- Require Critical=0, Major=0 and Minor<20 for the same source SHA.
- Record distinct BA/QA checker results against the same OAS, code and DB snapshot identities.
