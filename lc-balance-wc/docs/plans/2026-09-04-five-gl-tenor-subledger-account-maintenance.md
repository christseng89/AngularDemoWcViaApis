# Config-driven five-GL / tenor-SL account maintenance plan

**Goal:** Maintain five logical Balance GL families under Import and Export, with category-specific Tenor sub-ledgers driven from one configuration source rather than source-code or database enums.

## Confirmed model

| Category | Configured Tenor / SL enum |
|---|---|
| Import LC | `SIGHT`, `BUYERS_USANCE`, `SELLERS_USANCE` |
| Export Confirmed | `SIGHT`, `USANCE` |

These are five category-scoped choices. Import Sight and Export Sight are separate configuration identities even though both display as “Sight”.

The five current GL families are:

1. Import LC Balance
2. Import Acceptance Balance
3. Shipping Guarantee Balance
4. Confirmed LC Balance
5. Confirmed Acceptance Balance

Each GL family owns one or more configured SL routes. Account A/B values remain per SL mapping because the GL is common by accounting family while the SL differs by Tenor. The application must not force sibling SL rows to use identical full posting account strings.

## Configuration and compatibility

- `config/balance-account-mappings.json` is the canonical taxonomy and seed source.
- It declares categories, category-scoped Tenor values, canonical processing behavior, five GL families, valid SL routes, labels, and initial account identities.
- New Tenor values may be added by configuration when they map to an existing canonical processing behavior. A genuinely new accounting behavior still requires a separately designed code change.
- Existing configured rows are reconciled at startup without overwriting maintained account values. Removed configuration is retired from selection but historical voucher snapshots remain unchanged.
- Existing mapping keys remain stable so historical references are not rewritten.
- `SBLC_LG_業務種類與Balance帳務_GL_SL增補版.docx` is non-normative future reference only. No SBLC/LG function is added in this change.

## Database change

Add one data-preserving migration that rebuilds `balance_account_mappings` without the fixed `risk_class IN (...)` CHECK. Configuration validation becomes the authority for allowed category/Tenor/SL routes. Keep the primary key, unique family/SL constraint, version rule, and all existing data.

The transaction contract table is not widened by this maintenance-only migration. Runtime transaction Tenor selection and request validation consume the same canonical configuration, while persisted canonical behavior values remain backward compatible.

## Implementation tasks

1. Add failing tests for the configuration provider: two categories, five scoped Tenor definitions, five families, valid routes, duplicate rejection, and unknown route rejection.
2. Implement immutable taxonomy interfaces and a JSON provider. Remove the hard-coded `BalanceAccountRiskClass` union and switch-based mapping resolver.
3. Add migration 26 and data-preservation tests removing the fixed mapping constraint.
4. Reconcile configured seed rows without overwriting maintained values, and filter maintenance results to active configured rows.
5. Return category/family/SL metadata from `GET /balance-account-mappings` and add an atomic family update accepting separate values and expected versions for each SL row.
6. Update Angular Account Maintenance to render Import/Export → five GL families → configured Tenor SL rows without a duplicated matrix.
7. Generate Angular transaction Tenor options from the same canonical JSON during `prepare:app`; remove hand-written option arrays and use configured behavior metadata for Sight/Usance routing.
8. Synchronize the microservice OAS, source documentation, and Obsidian knowledge base. Review the Channel OAS and change it only if it exposes these operations.
9. Run focused tests after each stage, then complete unit/coverage (all metrics ≥95%), lint, typecheck, build, OAS/docs validation, Business Case Runner, and browser acceptance.

## Acceptance criteria

- The UI reuses the Transaction Processing labels `Import LC` and `Export Confirmed` and shows exactly five current GL families.
- The Tenor domain is Import 3 + Export 2, not one global four-value enum.
- Allowed SL routes and UI choices are configuration-driven and are not repeated in Angular, Zod, or the mapping domain.
- The database contains no fixed CHECK enum for mapping SL/Tenor values.
- Family updates are atomic and optimistic-concurrency safe while preserving different SL account identities.
- Existing posting history and voucher account snapshots are immutable.
- OAS, source docs, Obsidian, and tests remain synchronized; all required coverage gates remain at least 95%.
