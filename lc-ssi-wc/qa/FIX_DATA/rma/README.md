# Governed FIX_DATA QA Package

**Purpose:** one controlled location for the read-only governed-data repair audit used by QA for Entity, Nostro, SSI and RMA data.

## Package contents

The complete TypeScript program and its tests are in
[`../src/governed-data-repair/`](../src/governed-data-repair/):

- domain identities and deterministic segmentation;
- API snapshot repository;
- Entity／Nostro／SSI validation policies;
- RMA canonical grouping and parameter-driven repair planner;
- approved four-row development Unknown-BIC skip policy;
- database Before／After logical snapshot SHA evidence;
- immutable JSON report writer and CLI;
- unit／contract tests for every component.

The program remains OO／policy-based and has one canonical source. Do not copy it back under `scripts/` or create a second repair implementation.

## Governed external inputs

The QA program intentionally consumes the shared production parameters rather than duplicating them inside this folder:

- `parameters/rma-message-scope.sr2026.json`;
- `parameters/payment-message-index.json`;
- `parameters/ssi-mappings.sr2026.manifest.json`;
- `parameters/ssi-mappings.sr2026.json`;
- `parameters/resolution-page-scenarios.sr2026.json`;
- `GET /api/rma-authorisations/message-type-policy`;
- `GET /api/settings/runtime` for the WAL-aware logical database snapshot SHA.

This preserves a single source of truth for UI, API validation, Load Data, Audit and Repair.

## Run the zero-write audit

Start the local BFF and SSI service, then run:

```powershell
npm run demo:audit:governed-data:v2 -- --output=tmp/governed-data-repair.json
```

Or call the QA entry point directly:

```powershell
node --experimental-strip-types qa/FIX_DATA/src/governed-data-repair/cli.ts --output=tmp/governed-data-repair.json
```

Expected safety evidence:

- `mode = DRY_RUN_ZERO_WRITES`;
- `metrics.databaseWrites = 0`;
- database Before SHA equals database After SHA;
- the approved PCBCCNBJ development gap is exactly two canonical groups／four `SYNTHETIC_DEMO` records with `SKIP_DEVELOPMENT_REFERENCE_GAP` and zero conversions;
- every other Unknown BIC fails closed as `SKIP_UNKNOWN_REFERENCE`.

Reports are transient QA evidence and must remain under repository-local `tmp/`; do not commit them.

## Run package tests

```powershell
node --test --experimental-strip-types qa/FIX_DATA/src/governed-data-repair/*.test.ts
```

Then run the standard project gate:

```powershell
npm run verify
```

## Mutation boundary

This package currently performs analysis and Dry Run reporting only. It does **not** contain or authorize Runtime Apply, Submit, Checker Approve, direct SQL mutation, history rewriting or automatic Bank Service catalogue creation. Runtime Apply remains blocked until the separately governed BA／QA／DBA gate and explicit Product Owner authorization are complete.
