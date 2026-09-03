---
title: "A4 Sight Settlement"
type: function
domain: import
status: verified
source_of_truth: source-code
source_revision: "c7e9884"
verified_date: 2026-09-03
generated: true
aliases: ["A4", "Sight Settlement"]
tags: ["function", "import"]
source_files:
  - "src/app/transaction-builder/balance-component.model.ts"
  - "src/app/transaction-builder/builder-fields.ts"
  - "microservices/balance-component/src/service/balanceService.ts"
---

# A4 Sight Settlement

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Contract

| Field | Value |
|---|---|
| Code | `A4` |
| Side | `IMPORT` |
| Instrument | `IPLC_LC` |
| Movement | `UTILIZE` |
| Parent | — |
| Catalog tenor filter | `SIGHT` |
| Accounting | [[Transaction Accounting Matrix#Import transactions]] |
| Balance algorithm | [[Transaction Balance Calculation Matrix#Import transactions]] |

## Selection conditions

- 只顯示 Sight IPLC_LC。
- 第二層選擇已由 A3／A3S acknowledge、仍 PENDING 的 UTILIZE／IB record。
- Amount 從來源 arrival 帶入；沒有 eligible arrival 時不可 Submit。

Picker 只提供候選提示；API 在 Maker Submit 與 Checker action 依該功能重新驗證，不信任過期的 UI snapshot。

## Source-defined behavior

Sight only — pick the LC (LC Index), then the still-PENDING IB record under it (IB Index) that A3 recorded; Amount is shown read-only from that record, never re-typed. Maker: Submit A4 — a real action confirming this Document Arrival for settlement (no LC Balance change yet). Checker: search the same LC in the Checker panel below and Release — this moves the LC Balance from Pending to Approved/Utilized and is the only step that finalizes it. If nothing is PENDING yet, use A3 (Document Arrival) first.

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
