# MT347 v6 QA and architecture gates

This directory contains isolated, rerunnable controls for the controlled MT347 v6
TDD and ADR-001. It does not modify product code, fixtures, the controlled
workbook, or existing QA suites.

Run the unit tests:

```powershell
node --test scripts/mt347-v6-qa/*.test.mjs
```

Run the current readiness audit:

```powershell
node scripts/mt347-v6-qa/run.mjs --output scripts/mt347-v6-qa/output/current.json
```

The audit is intentionally fail-closed. A missing runtime contract trace is
`NOT_EXECUTED`; existing Angular business hard-code is `FAIL`; and the 42
upstream-validator-owned cases remain `NOT_EXECUTED` until a complete real FIN
validator evidence set is supplied.

Optional evidence inputs:

```powershell
node scripts/mt347-v6-qa/run.mjs `
  --contract-trace <api-page-ui-trace.json> `
  --upstream-evidence <full-fin-validator-42.json> `
  --output <report.json>
```

The contract trace must identify `contractVersion`, `correlationId` and
`sourceIdentity`, and provide the exact parameter payload at the API,
page-model and UI-render-input stages. The three payloads must be deeply equal;
unknown future message, sequence, field and polarity values are not normalized
or reinterpreted.

The upstream evidence file must contain all 42 controlled case IDs from v6.
Each entry must identify the real validator and version, exact rule key,
request/response SHA-256, fixture binding, WAL-aware snapshot, correlation ID,
and `ssiOutcome=NOT_EVALUATED`. An SSI-simulated rejection is not accepted as
upstream FIN validation evidence.

`mt2-pacs009-regression.manifest.json` preserves the independent MT2/pacs.009
regression scope and machine-oracle requirements. Its declared status is
`PLANNED_NOT_EXECUTED`; the manifest itself is never execution evidence.
