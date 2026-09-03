---
title: "Decision Tables"
type: decision-table
domain: reference
status: verified
source_of_truth: source-code
source_revision: "bad2f0c"
verified_date: 2026-09-03
generated: true
aliases: []
tags: ["decision-table"]
source_files:
  - "src/app/transaction-builder/balance-component.model.ts"
  - "src/app/transaction-builder/function-strategy.ts"
  - "src/app/transaction-builder/builder-fields.ts"
  - "microservices/balance-component/src/validation/requestSchema.ts"
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

## Fix Pending mode

| Mode | Functions | Required correction input |
|---|---|---|
| `REMARKS_ONLY` | `A4`、`A6`、`A7`、`A9`、`B4`、`B5` | Remarks required；trim 後非空、≤ 500 字、且與原值不同 |
| `STANDARD` | `A1`、`A2`、`A3`、`A3S`、`A8`、`A10`、`A11`、`B1`、`B2`、`B3`、`B6`、`B7` | 依 function policy 修正 unlocked fields；Remarks 不要求 |

完整欄位鎖定、Reason Code 區別與 API validation 見 [[Maker Checker Lifecycle#Fix Pending modes]]。

## Checker Reject routing

| Input state／action | Queue／result | Audit |
|---|---|---|
| 人工 Maker transaction 被 Checker Reject | 回到原 Maker Queue，狀態 `REJECTED` | Reject actor／reason 保留在 movement history |
| `STANDARD` Fix Pending Save | 同一 movement identity 回到 `PENDING` | `status_before=REJECTED`，保存 before／after snapshot |
| `REMARKS_ONLY` Fix Pending Save | 同一 movement identity 回到 `PENDING`；只允許 Remarks 改變 | `status_before=REJECTED`，after snapshot 為 `PENDING` |
| Delete Pending Confirm | 狀態 `CANCELLED`，移出 Maker Queue | 寫入 append-only `delete_pending_audit` |

適用人工 catalog：Import `A1/A2/A3/A3S/A4/A6/A7/A8/A9/A10/A11`；Export `B1/B2/B3/B4/B5/B6/B7`。Batch Auto Expire／Auto Close 不在此表範圍。
