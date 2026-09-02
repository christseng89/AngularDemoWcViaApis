# Balance Account Number Maintenance Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use lint-and-validate after every implementation slice.

**Goal:** Add database-backed maintenance of the two-account mapping used by every Balance Component accounting risk route.

**Architecture:** The balance microservice owns fixed route definitions, SQLite persistence, environment-driven validation, and REST endpoints. A lazy standalone Angular component is shared by the app router and Web Component view loader. New movements resolve and snapshot account number, description, and mapping version; historical movements are not recomputed.

**Tech Stack:** Angular 20, Angular Elements, TypeScript, Express, Zod, Node SQLite, Jest, Supertest, OpenAPI 3.

---

### Task 1: Persistence and seed

**Files:**
- Create: `microservices/balance-component/config/balance-account-mappings.json`
- Create: `microservices/balance-component/src/domain/balanceAccountMapping.ts`
- Create: `microservices/balance-component/src/store/balanceAccountMappingStore.ts`
- Modify: `microservices/balance-component/src/db/schema.ts`
- Modify: `microservices/balance-component/src/db/migrations.ts`
- Test: `microservices/balance-component/test/unit/store/balanceAccountMappingStore.test.ts`

1. Write failing tests for the 11 fixed routes, two-account shape, seed idempotency, list ordering, versioned update, and stale update rejection.
2. Add migration 23 and fresh-schema SQL for `balance_account_mappings`.
3. Add the JSON seed with current account names as backward-compatible initial number/description values.
4. Implement the SQLite store and seed-on-empty behavior.
5. Run the focused store and migration tests.

### Task 2: Configuration, service, and API

**Files:**
- Modify: `microservices/balance-component/src/config.ts`
- Create: `microservices/balance-component/src/service/balanceAccountMappingService.ts`
- Create: `microservices/balance-component/src/routes/balanceAccountMappings.ts`
- Modify: `microservices/balance-component/src/app.ts`
- Test: `microservices/balance-component/test/unit/balanceAccountMappingsApi.test.ts`

1. Write failing tests for GET, successful PUT, invalid regex/length input, incomplete account pairs, and HTTP 409 version conflicts.
2. Parse and validate the three environment variables once at startup.
3. Implement the service and strict request schema.
4. Register GET `/balance-account-mappings` and PUT `/balance-account-mappings/:mappingKey`.
5. Run focused API tests, typecheck, and lint.

### Task 3: Movement integration

**Files:**
- Modify: `microservices/balance-component/src/types.ts`
- Modify: `microservices/balance-component/src/domain/contingentAccountEntry.ts`
- Modify: `microservices/balance-component/src/service/balanceService.ts`
- Modify: `microservices/balance-component/src/store/balanceMovementStore.ts`
- Modify: `microservices/balance-component/src/db/schema.ts`
- Modify: `microservices/balance-component/src/db/migrations.ts`
- Test: existing contingent-account and service tests

1. Extend persisted contingent entries with number, description, mapping key, and mapping version while preserving legacy fields.
2. Resolve route by protected contract tenor and instrument type.
3. Apply movement direction after mapping resolution; never let callers submit Dr/Cr mappings.
4. Verify all A/B function shapes, compound movements, zero-entry cases, and historical immutability.

### Task 4: Angular and Web Component UI

**Files:**
- Create: `src/app/balance-account-maintenance/*`
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/app.component.ts`
- Modify: `src/app/web-component/balance-component-element.component.*`
- Modify: `src/app/web-component/balance-component-element.contract.ts`
- Modify: `src/app/transaction-builder/account-entries-dialog.component.*`
- Test: component/service/contract specifications

1. Add an API service and OnPush signal-based standalone component.
2. Render one editable card/row per fixed route with Account A/B number and description.
3. Save one row at a time, preserve unsaved input on errors, and reload the returned version on success.
4. Add the first navigation item in both shells and extend the WC navigation contract.
5. Display `number — description`, collapsing exact duplicates to one value.
6. Run focused Jest tests, Angular typecheck, lint, and WC build.

### Task 5: Contracts and documentation

**Files:**
- Modify: `analysis/balance-component-api.yaml`
- Modify: `analysis/balance-component-channel-api.yaml` where applicable
- Modify: `README.md`, Web Component usage/contract documents, and related Obsidian notes
- Create/update API and maintenance operation documentation

1. Add GET/PUT paths, schemas, validation metadata, 400 and 409 responses to OAS.
2. Document the three environment variables and fixed-length rule.
3. Document DB ownership, JSON seed/export semantics, route matrix, and history behavior.
4. Run OAS/document validation, all microservice/backend/frontend tests, lint, typechecks, Angular/WC builds, and security audit.

