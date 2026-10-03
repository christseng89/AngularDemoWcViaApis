# SSI Resolution Routing and SWIFT Country Standing Data Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace currency-only SSI selection with an auditable, fail-closed resolver that enriches BIC data through mock standing-data services, filters ineligible routes, ranks compatible SSI records, supports controlled route override, and creates an immutable settlement snapshot only after confirmation.

**Architecture:** Keep reference enrichment in the BFF/orchestration layer and keep the domain resolver deterministic and side-effect free. Country, Currency, Business Function Taxonomy, Bank Directory, SSI and Nostro remain separate standing-data concerns. The SSI service owns eligibility/ranking, confirmation, immutable snapshot and decision audit; the portal consumes `preview` and `confirm` APIs and never invents a route locally.

**Tech Stack:** Angular 22, NestJS 11, Nx 23, TypeScript 6, Jest, SQLite JSON persistence, OpenAPI 3, Playwright-compatible Node E2E scripts.

---

## Understanding Summary

- Currency alone is not enough to resolve an SSI. The request also carries BIC, product, direction, booking entity, network, value date and amount.
- Country is a Standing Data Microservice domain, mocked in this prototype in the same style as Currency.
- Country codes use the SWIFT BIC country convention: uppercase ISO 3166-1 alpha-2. BIC positions 5–6 are parsed, then validated/enriched against Country Standing Data.
- Business Function is governed Standing Data. A small filtered set uses a searchable dropdown; a large set uses a searchable three-level picker: Business Domain → Module/Product Family → Function/Lifecycle Event. Only a leaf function can be selected.
- Country meanings remain explicit: counterparty, beneficiary bank, settlement/clearing, booking entity and correspondent country are separate fields; there is no ambiguous generic `country` field.
- Eligibility and ranking are separate stages. Status/date/currency/direction/amount and compatible exact-or-`ANY` dimensions determine eligibility. Specificity, approved fallback level, route preference and priority determine ordering.
- The resolver returns `RESOLVED`, `MULTIPLE_CANDIDATES`, `NO_SSI_FOUND` or `NO_ELIGIBLE_ROUTE` with evidence. It never silently selects an unrelated generic SSI.
- Preview recommends a route and exposes alternatives through “Change Route”. Confirm requires an override reason when the selected SSI is not the recommendation.
- No final settlement instruction or release token exists before confirm. No eligible route permits Save/Pending/Exception but blocks Payment/Settlement Release.
- Phase 1 evaluates master-data facts only. Cut-off, holiday, liquidity and compliance are integration hooks recorded as `NOT_EVALUATED`.

## Assumptions and Constraints

- `ANY` is an explicit stored value, never an implicit null/blank wildcard.
- BIC input is normalized to uppercase and validated as BIC8 or BIC11 before country extraction.
- Business Function search may accept free-text keywords, but a transaction can store only an active immutable leaf `functionCode/id`; labels and free text are never resolver inputs.
- `consumer` identifies the calling channel/use case and is mapped many-to-many to functions. It is not assumed to equal the Business Domain.
- If Bank Directory cannot enrich a BIC, a country-specific SSI is ineligible. Only a separately approved `ANY`/global fallback can remain eligible, and the missing enrichment is visible in evidence.
- Network, product, booking entity, country and counterparty criteria use exact-or-`ANY` compatibility. An exact mismatch is excluded; an exact match outranks `ANY`.
- Currency and direction are hard transaction dimensions. Status must be `ACTIVE`; `validFrom <= valueDate <= validTo` when bounds exist; amount must be inside configured bounds.
- The “actual SWIFT receiver BIC” is derived from the selected route and must have the required outbound RMA authorization before settlement release. RMA failure is an exclusion/release-blocking result, not a warning.
- SQLite currently stores the SSI record as JSON, so additive criteria and decision evidence do not require destructive table migration. Existing rows receive backward-compatible defaults only through an explicit normalization function.
- Existing parameter-driven OAS screens, shared CRUD behavior, theme modes, imports and current seed flows must remain working.

## Resolution Contract

### Request

```ts
interface ResolutionRequest {
  consumer: 'TRADE_FINANCE' | 'TREASURY' | 'CENTRAL_PAYMENT';
  counterpartyBic: string;
  beneficiaryBankBic?: string;
  currency: string;
  product: string;
  businessFunctionCode: string;
  direction: 'INBOUND' | 'OUTBOUND';
  bookingEntity: string;
  settlementNetwork: string;
  valueDate: string;
  amount: string;
  transactionReference: string;
}
```

### Enriched facts

```ts
interface ResolutionFacts extends ResolutionRequest {
  counterpartyCountry: string;
  beneficiaryBankCountry?: string;
  bookingEntityCountry: string;
  bankDirectoryVersion: string;
  countryCatalogueVersion: string;
  currencyCatalogueVersion: string;
  businessFunctionTaxonomyVersion: string;
}
```

Every country value above is uppercase ISO alpha-2. Settlement and correspondent country belong to candidate routes, not user-entered request fields.

### Response

```ts
type ResolutionDecision =
  | 'RESOLVED'
  | 'MULTIPLE_CANDIDATES'
  | 'NO_SSI_FOUND'
  | 'NO_ELIGIBLE_ROUTE';

interface ResolutionPreview {
  decision: ResolutionDecision;
  recommendedRoute?: RankedRoute;
  alternatives: RankedRoute[];
  failedCriteria: CriterionEvidence[];
  rankingEvidence: RankingEvidence[];
  enrichment: ResolutionFacts;
  attemptId: string;
}
```

`POST /api/resolve/preview` enriches and evaluates but does not create a snapshot. `POST /api/resolve/confirm` accepts `attemptId`, `selectedSsiId`, `actor`, and an `overrideReason` when applicable, revalidates the selected route, verifies required RMA for the actual receiver BIC, then creates the immutable snapshot.

## Deterministic Decision Rules

1. Find related SSI records by currency and configured transaction scope. If none exist, return `NO_SSI_FOUND`.
2. Evaluate each related record against status, dates, direction, exact-or-`ANY` dimensions, amount, Nostro availability and actual-receiver RMA.
3. If related records exist but none are eligible, return `NO_ELIGIBLE_ROUTE` with every exclusion reason.
4. Rank eligible records lexicographically so a later criterion cannot outweigh an earlier one:
   `counterparty exact → country exact → exact function/module/domain fallback → product exact → booking entity exact → network exact → fallback level → preferred flag → priority → SSI id`.
5. A pre-approved fallback chain may progress through exact BIC/country, country, region and global `ANY`. Each level must be explicitly configured on the SSI.
6. If one top route remains, return `RESOLVED`. If eligible alternatives exist, return `MULTIPLE_CANDIDATES` while still providing a deterministic recommendation.
7. A retry creates a new attempt. It never overwrites prior evidence.

## Decision Log

| Decision | Rationale |
| --- | --- |
| BFF enriches BIC/Country; domain resolver receives facts | Keeps external lookups out of deterministic business rules and makes domain tests fast. |
| Country key is ISO 3166-1 alpha-2 used by SWIFT BIC | One code set supports dropdowns, BIC parsing and SSI matching without translation drift. |
| Business Function is a versioned hierarchy | It prevents free-text routing drift while keeping large TF/Treasury/Payment catalogues navigable. |
| Resolver stores the canonical leaf function code/id and taxonomy version | Display labels can change without changing historical resolution meaning; module/domain/`ANY` remain explicit approved fallbacks. |
| Exact-or-`ANY` compatibility precedes specificity ranking | Prevents an exact mismatch from being ranked as a candidate while controlling master-data growth. |
| Lexicographic rank instead of a single weighted score | Makes priority explainable and prevents a high numeric priority from beating a more specific route. |
| Preview and confirm are separate | Allows operations to inspect alternatives while keeping snapshots immutable and controlled. |
| No route blocks release | Avoids dangerous guessing; setup or operational exceptions remain visible and actionable. |
| Phase 1 records dynamic controls as `NOT_EVALUATED` | Preserves future integration contracts without pretending unavailable services were checked. |

## Task 1: Add SWIFT Country Standing Data Mock

**Files:**

- Create: `apps/mock-reference-services/src/country-catalogue.ts`
- Create: `apps/mock-reference-services/src/country-catalogue.spec.ts`
- Modify: `apps/mock-reference-services/src/main.ts`
- Modify: `apps/ssi-bff/src/main.ts`
- Modify: `scripts/e2e-swift-data.mjs`

**Step 1: Write failing catalogue tests**

Cover uppercase alpha-2 validation, unique codes, `HK/US/GB/FR/DE/JP/SG/CN/ZA`, region lookup, enabled status, and rejection of `UK`, lowercase, alpha-3 and unknown codes.

**Step 2: Run the focused test and confirm failure**

Run: `npx nx test mock-reference-services --configuration=ci --testPathPattern=country-catalogue.spec.ts`

Expected: FAIL because the catalogue does not exist.

**Step 3: Implement the mock catalogue and endpoints**

Add immutable records containing `code`, `name`, `region`, `enabled`, `standard: 'ISO_3166_1_ALPHA_2'`, and `version`. Expose:

- `GET /api/countries`
- `GET /api/countries/:code`
- `GET /api/banks/:bic` response enriched with `countryCode`, SWIFT address and directory version

Proxy them from the BFF as:

- `GET /api/reference/countries`
- `GET /api/reference/countries/:code`
- `GET /api/reference/banks/:bic`

**Step 4: Verify BIC derivation**

Normalize BIC8/BIC11, derive positions 5–6, and verify the derived code exists and is enabled in the catalogue. Never accept the parsed characters without catalogue validation.

**Step 5: Run tests and API smoke coverage**

Run:

```powershell
npx nx test mock-reference-services --configuration=ci
node scripts/e2e-swift-data.mjs
```

**Step 6: Commit**

```powershell
git add apps/mock-reference-services/src apps/ssi-bff/src/main.ts scripts/e2e-swift-data.mjs
git commit -m "feat: add SWIFT country standing data mock"
```

## Task 2: Extend SSI Master Data Criteria and OAS Parameters

**Files:**

- Modify: `libs/domain/src/lib/ssi.ts`
- Modify: `apps/ssi-service/src/app/ssi-application.service.ts`
- Modify: `apps/ssi-service/src/app/sqlite-ssi.repository.ts`
- Modify: `openapi/swift-data-service.v1.json`
- Modify: `apps/ssi-portal/public/openapi/swift-data-service.v1.json`
- Modify: `fixtures/ten-bank-ssi.seed.json`
- Modify: `scripts/seed-demo-ssis.mjs`
- Modify: `scripts/seed-swift-data.mjs`
- Create: `apps/mock-reference-services/src/business-function-catalogue.ts`
- Create: `apps/mock-reference-services/src/business-function-catalogue.spec.ts`
- Modify: `apps/mock-reference-services/src/main.ts`
- Modify: `apps/ssi-bff/src/main.ts`

**Step 1: Add failing domain/application tests**

Require explicit criteria fields for `direction`, `product`, structured Business Function matcher, `counterpartyBic`, `counterpartyCountry`, `settlementCountry`, `bookingEntity`, `bookingEntityCountry`, `network`, `validFrom`, `validTo`, `minimumAmount`, `maximumAmount`, `fallbackLevel`, `preferred`, `priority`, plus route `correspondentCountry` and `actualReceiverBic`.

Add a versioned taxonomy with immutable `id/code`, bilingual names, domain, module, parent, selectable leaf flag, status/effective dates, allowed consumer/entity/direction scopes, version, successor and Maker-Checker evidence. Model matching as `EXACT_FUNCTION`, `MODULE`, `DOMAIN` or `ANY`; do not put `ANY` into the function-code field.

Test that country fields accept only uppercase alpha-2 or the explicit sentinel `ANY`; route country fields cannot use a blank wildcard.

**Step 2: Run tests and confirm failure**

Run: `npx nx test domain --configuration=ci`

**Step 3: Implement typed criteria and backward normalization**

Introduce `SsiResolutionCriteria`, `FallbackLevel`, amount-as-decimal-string validation, and a single normalization function for existing JSON records. Do not silently turn missing dimensions into unrestricted routes; legacy rows should be marked for revision unless an approved compatibility default is explicitly documented in the seed.

**Step 4: Update parameter-driven screens**

Add dropdown parameters for all country fields using `/api/reference/countries`. Display `CODE · Name` consistently. Keep BIC-derived country read-only in transaction resolution; allow SSI maintainers to choose exact country, region policy or `ANY` in master data.

Expose `GET /api/reference/business-functions` with consumer/entity/status/effective-date filtering and taxonomy version. Use a searchable dropdown below the configured option threshold (default 20); above it, open a three-column Domain → Module → Function picker. Only active leaf functions are selectable, and the saved value is the canonical code/id rather than its label.

**Step 5: Expand seed data**

Maintain 2–5 active SSI examples per supported currency. Include:

- exact BIC and country route;
- country route;
- region fallback;
- approved global `ANY` route;
- expired/suspended/amount-exceeded records for negative evidence;
- corresponding active Nostro and RMA records where required.

**Step 6: Verify mirrored OpenAPI files are identical**

Run:

```powershell
node -e "const fs=require('fs');const a=fs.readFileSync('openapi/swift-data-service.v1.json','utf8');const b=fs.readFileSync('apps/ssi-portal/public/openapi/swift-data-service.v1.json','utf8');if(a!==b)process.exit(1)"
npm run demo:seed
```

**Step 7: Commit**

```powershell
git add libs/domain/src/lib/ssi.ts apps/ssi-service/src/app openapi apps/ssi-portal/public/openapi fixtures scripts
git commit -m "feat: add SSI routing criteria"
```

## Task 3: Build the Pure Eligibility and Ranking Engine

**Files:**

- Modify: `libs/domain/src/lib/resolution.ts`
- Modify: `libs/domain/src/lib/resolution.spec.ts`
- Modify: `libs/domain/src/lib/domain-coverage.test.ts`
- Modify: `libs/domain/src/index.ts`

**Step 1: Write decision-table tests first**

Add table-driven tests for:

- exact BIC beats country, region and global routes;
- exact Business Function beats approved module, domain and `ANY` function fallbacks;
- exact country beats `ANY` for the same BIC compatibility level;
- product/entity/network exact beats its `ANY` equivalent;
- specificity beats numeric priority;
- `ACTIVE`, effective date, currency, direction and amount exclusions;
- missing/disabled Nostro and missing actual-receiver outbound RMA exclusions;
- BIC country mismatch exclusion;
- one recommendation with alternatives;
- deterministic tie break by SSI id;
- each of the four public decision states;
- dynamic control evidence is `NOT_EVALUATED` in phase 1.

**Step 2: Run focused tests and confirm failure**

Run: `npx jest --config libs/domain/jest.config.ts libs/domain/src/lib/resolution.spec.ts --runInBand`

**Step 3: Implement a side-effect-free resolver**

Use explicit inputs: enriched transaction facts, SSI candidates, Nostro availability facts and RMA authorization facts. Return candidate evidence rather than throwing for expected no-route outcomes. Reserve `DomainRuleError` for malformed requests or impossible invariants.

**Step 4: Encode lexicographic ranking**

Represent ranking as named components and compare component-by-component. Return those same components in `rankingEvidence`; never duplicate ranking logic in controllers or the UI.

**Step 5: Run domain coverage**

Run: `npx nx test domain --configuration=ci`

Expected: PASS with branch coverage for all decision and exclusion paths.

**Step 6: Commit**

```powershell
git add libs/domain/src
git commit -m "feat: implement deterministic SSI resolver"
```

## Task 4: Implement Preview Orchestration

**Files:**

- Create: `apps/ssi-service/src/app/resolution/resolution.dto.ts`
- Create: `apps/ssi-service/src/app/resolution/resolution.service.ts`
- Create: `apps/ssi-service/src/app/resolution/resolution.controller.ts`
- Create: `apps/ssi-service/src/app/resolution/resolution.service.spec.ts`
- Modify: `apps/ssi-service/src/app/app.module.ts`
- Modify: `apps/ssi-service/src/app/sqlite-ssi.repository.ts`
- Modify: `apps/ssi-bff/src/main.ts`

**Step 1: Write failing orchestration tests**

Mock reference responses and verify the BFF normalizes BIC, fetches Bank Directory, validates its country through Country Standing Data, enriches booking-entity country and currency metadata, then sends stable facts to the SSI service.

Test reference timeout/not-found behavior: evidence must identify failed enrichment; no country-specific rule may pass based on guessed data.

**Step 2: Add `POST /api/resolve/preview`**

Validate the request DTO, create a unique attempt id, load candidate SSI/Nostro/RMA data, call the pure resolver, and return `decision`, recommendation, alternatives, failed criteria, ranking evidence and enrichment metadata. Do not persist a settlement snapshot.

**Step 3: Preserve legacy compatibility deliberately**

Either adapt the existing `POST /api/resolve` endpoint to call preview and map the old response, or mark it deprecated in OpenAPI while keeping current demo consumers functional until Task 7 switches them.

**Step 4: Run service tests**

Run:

```powershell
npx nx test ssi-service --configuration=ci
npx nx test ssi-bff --configuration=ci
```

**Step 5: Commit**

```powershell
git add apps/ssi-service/src/app/resolution apps/ssi-service/src/app/app.module.ts apps/ssi-service/src/app/sqlite-ssi.repository.ts apps/ssi-bff/src/main.ts
git commit -m "feat: add SSI resolution preview"
```

## Task 5: Implement Confirm, RMA Gate, Immutable Snapshot and Audit

**Files:**

- Modify: `apps/ssi-service/src/app/resolution/resolution.dto.ts`
- Modify: `apps/ssi-service/src/app/resolution/resolution.service.ts`
- Modify: `apps/ssi-service/src/app/resolution/resolution.controller.ts`
- Modify: `apps/ssi-service/src/app/resolution/resolution.service.spec.ts`
- Modify: `apps/ssi-service/src/app/sqlite-ssi.repository.ts`
- Modify: `apps/ssi-bff/src/main.ts`
- Modify: `libs/domain/src/lib/resolution.ts`
- Modify: `libs/domain/src/lib/resolution.spec.ts`

**Step 1: Write failing confirmation tests**

Cover:

- recommended route confirmation;
- alternative selection requires nonblank override reason;
- selected route must belong to the preview attempt;
- revalidation catches SSI/RMA/Nostro changes between preview and confirm;
- actual SWIFT receiver BIC without required outbound RMA blocks confirmation;
- failed/no-route attempts cannot confirm;
- repeated confirm is idempotent for the same key;
- retry creates a new attempt and preserves the old one.

**Step 2: Persist append-only decision attempts**

Store original request, enrichment, per-candidate eligibility, full rank tuple, recommendation, selected SSI, override reason, actor and timestamp. Store version/hash evidence for SSI, Bank, Country, Currency, Nostro and RMA records. Add an append-only resolution attempt/audit table; do not mutate prior attempt JSON.

**Step 3: Add `POST /api/resolve/confirm`**

Re-run release-critical checks, then produce the immutable snapshot containing SSI id/version, complete selected route, actual receiver BIC, RMA evidence and source hashes. Return a release-safe confirmation id only on success.

**Step 4: Run service and domain tests**

Run:

```powershell
npx nx test domain --configuration=ci
npx nx test ssi-service --configuration=ci
```

**Step 5: Commit**

```powershell
git add apps/ssi-service apps/ssi-bff/src/main.ts libs/domain/src/lib/resolution*
git commit -m "feat: confirm and audit resolved SSI routes"
```

## Task 6: Rebuild the SSI Resolution Workbench UI

**Files:**

- Modify: `apps/ssi-portal/src/app/app.component.ts`
- Modify: `apps/ssi-portal/src/app/app.component.html`
- Modify: `apps/ssi-portal/src/styles.css`
- Create: `apps/ssi-portal/src/app/resolution-view-model.spec.ts`
- Create: `apps/ssi-portal/src/app/resolution-view-model.ts`

**Step 1: Write view-model tests**

Test request-to-preview mapping, BIC/country display, Business Function dropdown/tree-picker threshold and leaf-only selection, decision labels, recommended/alternative ordering, override validation, and release-disabled states.

**Step 2: Add transaction inputs and standing-data enrichment**

Use shared currency and country option formatting. When the user selects/enters a valid BIC, show the Bank Directory name, SWIFT address and read-only country. Do not allow manual edits to a BIC-derived country.

Load Business Functions through Standing Data and filter them by consumer, booking entity, entitlement, status and effective date. Display the selected breadcrumb and `FUNCTION_CODE · 中文名稱 / English name`. A missing/invalid/retired function returns `INVALID_BUSINESS_FUNCTION` or `REFERENCE_DATA_UNAVAILABLE`; it must never degrade to currency-only resolution.

**Step 3: Add preview states**

Show:

- recommended route with reason/evidence;
- “Change Route” to reveal 2–5 compatible alternatives;
- selected alternative and mandatory override reason;
- `NO_SSI_FOUND` with “Request SSI Setup”;
- `NO_ELIGIBLE_ROUTE` with excluded routes and failed criteria;
- separate loading, reference-error and malformed-input states.

**Step 4: Add confirm and release controls**

Confirm is enabled only for a currently eligible selected route. No settlement token/instruction is shown before confirm. Any failed RMA, no-route result or stale preview keeps release disabled.

**Step 5: Keep visual conventions consistent**

Respect light/dark/system themes, existing typography, shared button order, and selected-tab contrast. Avoid horizontal overflow at current portal breakpoints.

**Step 6: Run portal tests/build**

Run:

```powershell
npx nx test ssi-portal --configuration=ci
npx nx build ssi-portal
```

**Step 7: Commit**

```powershell
git add apps/ssi-portal/src
git commit -m "feat: add explainable SSI resolution workbench"
```

## Task 7: Update the Web Component and OpenAPI Contracts

**Files:**

- Modify: `apps/ssi-web-components/src/resolution-widget.component.ts`
- Modify: `openapi/swift-data-service.v1.json`
- Modify: `apps/ssi-portal/public/openapi/swift-data-service.v1.json`
- Modify: `docs/api-demo-coverage.md`
- Modify: `scripts/exercise-all-apis.mjs`

**Step 1: Add contract examples**

Document Country, Bank enrichment, preview, confirm, all four decisions, override validation and RMA failure. Define alpha-2 patterns as `^[A-Z]{2}$`; keep `ANY` only in SSI criteria schemas, never in Country Standing Data schemas.

**Step 2: Move the web component to preview/confirm**

Match portal semantics while retaining a compact embeddable presentation. Remove local currency-only selection and consume ranking evidence from the API.

**Step 3: Exercise every API**

Run: `node scripts/exercise-all-apis.mjs`

Expected: Country lookup, bank enrichment, resolved preview, override confirm and failure response examples all pass.

**Step 4: Commit**

```powershell
git add apps/ssi-web-components openapi apps/ssi-portal/public/openapi docs/api-demo-coverage.md scripts/exercise-all-apis.mjs
git commit -m "docs: publish SSI resolver contracts"
```

## Task 8: End-to-End Acceptance and Regression Verification

**Files:**

- Modify: `scripts/e2e-swift-data.mjs`
- Create: `docs/ssi-resolution-operations.md`

**Step 1: Add acceptance scenarios**

Automate at least:

1. USD + HSBC London resolves exact GB/BIC SSI ahead of generic USD.
2. Exact BIC absent falls through only to approved country/region/global records.
3. Multiple compatible SSI records return a recommendation and selectable alternatives.
4. Override without reason is rejected; override with reason is audited.
5. No records gives `NO_SSI_FOUND`.
6. Expired/suspended/amount/Nostro failures give `NO_ELIGIBLE_ROUTE`.
7. Missing RMA for actual receiver BIC blocks confirm and release.
8. Country is derived from BIC and matches the mock Country service.
9. Retry creates a separate decision attempt.
10. Existing RMA, SSI, Nostro CRUD/import/sorting/view behavior remains intact.

**Step 2: Write the operations note**

Explain decision states, evidence interpretation, approved fallback governance, override procedure, RMA release gate, retry semantics, and phase-1 `NOT_EVALUATED` controls.

**Step 3: Run the full validation required after code changes**

Run:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
node scripts/e2e-swift-data.mjs
node scripts/exercise-all-apis.mjs
git diff --check
```

Expected: all commands pass; browser smoke test at `http://localhost:4400/` shows correct light/dark/system contrast and resolution behavior.

**Step 4: Review release blockers**

Confirm there is no code path that creates a final snapshot or release token for `NO_SSI_FOUND`, `NO_ELIGIBLE_ROUTE`, stale preview, failed RMA, or unreasoned override.

**Step 5: Commit**

```powershell
git add scripts/e2e-swift-data.mjs docs/ssi-resolution-operations.md
git commit -m "test: cover SSI routing acceptance scenarios"
```

## Definition of Done

- Country values are sourced from the mock Country Standing Data service and use SWIFT-compatible uppercase ISO alpha-2 codes.
- Business Function values are sourced from a versioned taxonomy; only active leaves can be saved, and large catalogues use the three-level searchable picker.
- Resolution and audit store canonical function code/id plus taxonomy version/hash; labels and search text are never matched.
- BIC-derived country is validated, read-only in the resolution screen and captured with catalogue version/hash.
- Every candidate has inspectable eligibility and rank evidence.
- The fallback chain is configuration-driven and never guesses.
- The actual receiver BIC has the required RMA before confirmation/release.
- Preview cannot create a final settlement instruction; confirm creates exactly one immutable snapshot.
- Alternative selection requires actor and reason and is fully audited.
- All four resolution decisions are covered by domain, service and end-to-end tests.
- Existing parameter-driven CRUD and unrelated screens pass regression tests.
- `npm run verify`, API exercises, E2E checks and `git diff --check` pass.
