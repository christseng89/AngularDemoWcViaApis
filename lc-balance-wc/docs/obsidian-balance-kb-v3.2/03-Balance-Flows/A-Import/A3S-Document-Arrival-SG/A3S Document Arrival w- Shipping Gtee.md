---
title: "A3S Document Arrival w/ Shipping Gtee"
type: function
domain: import
status: verified
source_of_truth: source-code
source_revision: "1865d80"
verified_date: 2026-09-04
generated: true
aliases: ["A3S", "Document Arrival w/ Shipping Gtee"]
tags: ["function", "import"]
source_files:
  - "src/app/transaction-builder/balance-component.model.ts"
  - "src/app/transaction-builder/builder-fields.ts"
  - "microservices/balance-component/src/service/balanceService.ts"
---

# A3S Document Arrival w/ Shipping Gtee

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Contract

| Field | Value |
|---|---|
| Code | `A3S` |
| Side | `IMPORT` |
| Instrument | `IPLC_LC` |
| Movement | `UTILIZE` |
| Parent | — |
| Secondary reference | IB Number |
| Accounting | [[Transaction Accounting Matrix#Import transactions]] |
| Balance algorithm | [[Transaction Balance Calculation Matrix#Import transactions]] |

## Selection conditions

- 先選 ACTIVE IPLC_LC，再選該 LC 下具有 outstanding balance 的特定 SHGT。
- Bill Amount 必須大於或等於所選 SG Balance。
- Submit／Checker 都重查 LC、SG、amount 與 lifecycle。

Picker 只提供候選提示；API 在 Maker Submit 與 Checker action 依該功能重新驗證，不信任過期的 UI snapshot。

## Source-defined behavior

For documents arriving against an LC that still has an outstanding Shipping Guarantee reserving the capacity (A8). Pick the LC, then the specific SG record below — Bill Amount must be greater than or equal to the selected SG Balance. Maker Submit reserves BOTH the SG's full redemption and this Document Arrival as PENDING. Checker Approve re-validates the same minimum before releasing the SG redemption and moving the Document Arrival to EARMARKED (then continue to A4/A6).

## Direction／Movement options

無 Direction 選項。

## Processing boundary

欄位顯示、protected field、picker、submit shape 與 Checker routing 由 function catalog、builder field policies 與 service validation 共同決定。UI 不是權威驗證層；API 會重新驗證 contract、amount、currency、tenor、reference 與 lifecycle。

## Related

- [[Balance Sufficiency Rules]]
- [[Earmark Rules]]
- [[Maker Checker Lifecycle]]
- [[Linked Transaction Flows]]
- [[API Reference]]
