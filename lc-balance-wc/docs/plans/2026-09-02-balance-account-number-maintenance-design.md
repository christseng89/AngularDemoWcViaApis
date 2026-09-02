# Balance Account Number Maintenance Design

## Understanding summary

- Add a Balance Account Number view before Transaction Builder and Business Case Runner in both the standalone Angular shell and the Web Component shell.
- One maintained record is an accounting pair: Account A and Account B. Each side has an account number and an account description.
- Product/risk routes are predefined and cannot be added or deleted through this demo screen.
- Import LC, Import Acceptance, Shipping Guarantee, Export Confirmation, and Export Acceptance use tenor/risk-specific routes. SG Sight, Buyer's Usance, and Seller's Usance are independent records even when a bank enters the same pair.
- SQLite is the runtime source of truth. JSON is an initial seed/export format, not a second live source.
- All demo users may edit. Each row is saved independently with optimistic version checking.
- New mapping values affect new movements only. Persisted historical voucher entries remain immutable.

## Architecture

The microservice owns the mapping domain, SQLite persistence, validation, and GET/PUT API. Angular and the Web Component lazy-load the same standalone maintenance component and never access the file system directly. The domain resolves an accounting route from instrument type and contract tenor, then determines Dr/Cr from movement direction; users maintain the neutral Account A/Account B pair and cannot reverse Dr/Cr manually.

## Data model

`balance_account_mappings` contains one row per fixed route:

- `mapping_key` primary key, such as `IPLC_LC:SIGHT`
- `instrument_type` and `risk_class`, unique together
- Account A number and description
- Account B number and description
- optimistic `version`
- `updated_by` and `updated_at`

The JSON seed contains the same fixed route list. Existing account descriptions initialize both number and description so the first deployment preserves the current display. Banks replace the number values through the maintenance screen.

## Validation and reliability

- `BALANCE_ACCOUNT_NUMBER_REGEX` controls allowed content.
- `BALANCE_ACCOUNT_NUMBER_MIN_LEN` and `BALANCE_ACCOUNT_NUMBER_MAX_LEN` control trimmed length; equal values mean fixed length.
- Invalid environment configuration fails at service startup.
- PUT validates both accounts completely and updates one row in a transaction only when the expected version matches.
- A stale version returns HTTP 409. Invalid input returns HTTP 400.
- Account descriptions are required, trimmed, and bounded to 200 characters.
- The response returns validation metadata so the UI can give immediate feedback while the server remains authoritative.

## Decision log

1. SQLite, not JSON, is the live source because screen-based multi-user edits require transactions and version control.
2. JSON remains a deterministic seed/export artifact so database and JSON never act as competing authorities.
3. Routes are fixed and editable-only to guarantee complete coverage for A1-A11/B1-B7.
4. SG risk classes are separate records; duplicate account values are intentionally allowed.
5. One record stores two neutral accounts; movement direction decides Dr/Cr to prevent reversal mistakes.
6. Demo access is unrestricted, while structural and concurrency validation remain mandatory.
7. The maintenance UI uses a same-page master-detail flow: a searchable Account Set Index opens exactly one mapping in View mode, and Back to Index discards any unsaved edit.

## Same-page master-detail behavior

- Index rows show mapping key, product, risk class, version, and last updater; keyword search matches these fields and both account identities.
- Selecting a row replaces the Index with its Detail in the same Angular/WC view. No additional URL or API endpoint is introduced.
- Detail starts read-only. `Edit` enables both accounts, `Cancel` restores the persisted pair, and `Save Account Set` appears only after an actual change.
- Only one mapping can be edited at a time. `Back to Account Set Index` restores an unsaved pair before returning to the Index.
- Expected scale is tens of fixed mappings and demo-user concurrency; client-side filtering is sufficient, while optimistic version checking remains the reliability boundary.
- The feature adds no account data beyond the existing mapping response and does not change authorization or historical voucher behavior.
