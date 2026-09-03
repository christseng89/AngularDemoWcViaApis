---
title: "Decision Tables"
type: decision-table
domain: reference
status: verified
source_of_truth: source-code
source_revision: "c7e9884"
verified_date: 2026-09-03
generated: true
aliases: []
tags: ["decision-table"]
source_files:
  - "src/app/transaction-builder/balance-component.model.ts"
  - "microservices/balance-component/src/types.ts"
---

# Decision Tables

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Function catalog

| Function | Side | Instrument | Movement | Parent |
|---|---|---|---|---|
| [[A1 LC Issue]] | IMPORT | `IPLC_LC` | `ISSUE` | — |
| [[A2 LC Amendment]] | IMPORT | `IPLC_LC` | 依 Direction 選項 | — |
| [[A3 Document Arrival]] | IMPORT | `IPLC_LC` | `UTILIZE` | — |
| [[A3S Document Arrival w/ Shipping Gtee]] | IMPORT | `IPLC_LC` | `UTILIZE` | — |
| [[A4 Sight Settlement]] | IMPORT | `IPLC_LC` | `UTILIZE` | — |
| [[A6 Acceptance (Usance)]] | IMPORT | `IPLC_ACCEPTANCE` | `CREATE` | `IPLC_LC` |
| [[A7 Acceptance Settlement]] | IMPORT | `IPLC_ACCEPTANCE` | 依 Direction 選項 | `IPLC_LC` |
| [[A8 Shipping Gtee (Issue)]] | IMPORT | `SHGT` | `ISSUE` | `IPLC_LC` |
| [[A9 Shipping Gtee (Redemption)]] | IMPORT | `SHGT` | `FULL_REDEEM` | `IPLC_LC` |
| [[A10 LC Close]] | IMPORT | `IPLC_LC` | `CLOSE` | — |
| [[A11 LC Reopen]] | IMPORT | `IPLC_LC` | `REOPEN` | — |
| [[B1 Confirm LC]] | EXPORT | `EPLC_CONFIRMATION` | `ISSUE` | — |
| [[B2 Confirm LC Amendment]] | EXPORT | `EPLC_CONFIRMATION` | `AMEND` | — |
| [[B3 Present Docs]] | EXPORT | `EPLC_EXAMINATION` | `CREATE` | `EPLC_CONFIRMATION` |
| [[B4 Honour / Acceptance]] | EXPORT | `EPLC_CONFIRMATION` | `HONOUR` | — |
| [[B5 Settlement — Reimbursement / Maturity]] | EXPORT | `EPLC_ACCEPTANCE` | `FULL_SETTLE` | `EPLC_CONFIRMATION` |
| [[B6 Confirmed LC Close]] | EXPORT | `EPLC_CONFIRMATION` | `CLOSE` | — |
| [[B7 Confirmed LC Reopen]] | EXPORT | `EPLC_CONFIRMATION` | `REOPEN` | — |

## Status display

| Kind | Maker／Pending | Checker completed |
|---|---|---|
| General | PENDING | APPROVED |
| A3／A3S／B3 earmark | EARMARKING | EARMARKED |
| Close | CLOSING | CLOSED |
