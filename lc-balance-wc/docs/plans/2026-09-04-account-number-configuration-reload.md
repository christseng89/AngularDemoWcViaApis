# Account Number Configuration Reload Implementation Plan

> **For Codex:** Execute this plan task-by-task in the current workspace; preserve unrelated working-tree changes.

**Goal:** Capture the current 11 Account Number DB mappings as configuration defaults and make the maintenance screen's Reload button atomically overwrite DB mappings from that configuration.

**Architecture:** Keep taxonomy and default account identities in the existing `balance-account-mappings.json`. Add a dedicated service/store reset operation and HTTP endpoint; Angular invokes it only from the explicit Reload action, then refreshes from the API. Cleanup Database remains transaction-data-only.

**Tech Stack:** Angular 20, TypeScript, Express, Node SQLite, Zod, Jest, Supertest, OpenAPI 3.

---

## Understanding summary

- The current live DB contains 11 maintained Account Number mappings that must become the new defaults.
- Reload is an explicit destructive maintenance action and immediately overwrites all configured mapping rows.
- The overwrite must be all-or-nothing in one SQLite transaction.
- Cleanup Database does not reset Account Number mappings.
- Existing DB schema and GL/SL composition remain unchanged.
- OAS, normal docs and generated Obsidian notes must describe the same behavior.

## Assumptions and constraints

- Only keys present in the validated taxonomy configuration are reset; unrelated historical rows are not exposed or modified.
- Reset rows use version `1`, actor `SYSTEM_CONFIG_RELOAD`, and a shared reset timestamp.
- The configuration file contains defaults, not runtime secrets.
- The endpoint is part of the existing development/maintenance surface and inherits the prototype's current authentication posture.
- Eleven rows are small enough for a synchronous transaction; reliability is prioritized over partial progress.

## Decision log

| Decision | Alternatives | Reason |
|---|---|---|
| Dedicated reset endpoint | Angular loops existing PUT; couple reset to Cleanup Database | Gives one atomic server-side transaction and keeps cleanup semantics stable. |
| Reuse existing taxonomy JSON | Add a second defaults file; read SQLite directly during cleanup | Avoids duplicate configuration ownership and runtime dependence on a mutable DB. |
| Immediate overwrite | Preview then Save | Explicitly confirmed by the user. |
| Reset version to 1 | Increment existing version | The rows become a fresh configuration baseline rather than operator edits. |

### Task 1: Freeze the exported defaults

**Files:**

- Modify: `microservices/balance-component/config/balance-account-mappings.json`
- Test: `microservices/balance-component/test/unit/domain/balanceAccountTaxonomy.test.ts`

1. Replace the 11 seed account identities with values exported from the current DB.
2. Run the taxonomy unit tests and generator.

### Task 2: Add atomic reset behavior

**Files:**

- Modify: `microservices/balance-component/src/store/balanceAccountMappingStore.ts`
- Modify: `microservices/balance-component/src/service/balanceAccountMappingService.ts`
- Test: `microservices/balance-component/test/unit/balanceAccountMappingsApi.test.ts`

1. Write failing service/API tests for complete reset, version/actor, and rollback.
2. Add a store method that upserts every configured mapping inside one transaction.
3. Add a service method that returns the refreshed hierarchy.
4. Run focused microservice tests.

### Task 3: Expose the reset endpoint

**Files:**

- Modify: `microservices/balance-component/src/routes/balanceAccountMappings.ts`
- Modify: `analysis/balance-component-api.yaml`
- Test: `microservices/balance-component/test/unit/balanceAccountMappingsApi.test.ts`

1. Add `POST /balance-account-mappings/reload-configuration`.
2. Document success and standard error responses in OAS.
3. Verify route/OAS coverage.

### Task 4: Wire the Reload button

**Files:**

- Modify: `src/app/balance-account-maintenance/balance-account-maintenance-api.service.ts`
- Modify: `src/app/balance-account-maintenance/balance-account-maintenance.component.ts`
- Modify: `src/app/balance-account-maintenance/balance-account-maintenance.component.html`
- Test: matching Angular spec files.

1. Write failing tests proving Reload calls the reset endpoint and displays refreshed configuration-backed values.
2. Change the button action from read-only refresh to explicit server reset.
3. Disable actions during the request and present success/error feedback.
4. Run focused Angular tests.

### Task 5: Synchronize documentation and verify

**Files:**

- Modify: `docs/balance-account-number-maintenance.md`
- Modify: `docs/configuration.md`
- Modify: `scripts/rebuild-obsidian-kb.mjs`
- Regenerate: `docs/obsidian-balance-kb-v3.2/**`

1. State that Reload immediately overwrites DB values from configuration and Cleanup Database does not.
2. Regenerate Obsidian without changing its directory structure.
3. Run docs verification, lint, type checks and all three coverage suites; each coverage gate must remain above 95%.

