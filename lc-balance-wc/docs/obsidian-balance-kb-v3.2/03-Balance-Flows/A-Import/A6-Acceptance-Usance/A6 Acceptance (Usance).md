---
title: "A6 Acceptance (Usance)"
type: function
domain: import
status: verified
source_of_truth: source-code
source_revision: "1865d80"
verified_date: 2026-09-04
generated: true
aliases: ["A6", "Acceptance (Usance)"]
tags: ["function", "import"]
source_files:
  - "src/app/transaction-builder/balance-component.model.ts"
  - "src/app/transaction-builder/builder-fields.ts"
  - "microservices/balance-component/src/service/balanceService.ts"
---

# A6 Acceptance (Usance)

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Contract

| Field | Value |
|---|---|
| Code | `A6` |
| Side | `IMPORT` |
| Instrument | `IPLC_ACCEPTANCE` |
| Movement | `CREATE` |
| Parent | `IPLC_LC` |
| Payable movement | `UTILIZE` |
| Accounting | [[Transaction Accounting Matrix#Import transactions]] |
| Balance algorithm | [[Transaction Balance Calculation Matrix#Import transactions]] |

## Selection conditions

- 只選 Usance IPLC_LC。
- 第二層選擇已由 A3／A3S acknowledge、仍 PENDING 的 UTILIZE／IB record。
- Amount、tenor、currency 從來源 arrival 帶入並 protected。

Picker 只提供候選提示；API 在 Maker Submit 與 Checker action 依該功能重新驗證，不信任過期的 UI snapshot。

## Source-defined behavior

Usance only — pick the LC (LC Index), then the still-PENDING Document Arrival under it (IB Index) that A3 recorded; Amount, Tenor Type, and Tenor Days are carried over and protected (read-only). Maker: Submit only creates the new Acceptance Balance (PENDING) — the LC Balance stays unchanged. Checker: one Release click does BOTH — releases that Document Arrival (LC Balance Pending -> Approved/Utilized) AND approves the new Acceptance Balance.

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
