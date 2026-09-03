---
title: "A10 LC Close"
type: function
domain: import
status: verified
source_of_truth: source-code
source_revision: "bad2f0c"
verified_date: 2026-09-03
generated: true
aliases: ["A10", "LC Close"]
tags: ["function", "import"]
source_files:
  - "src/app/transaction-builder/balance-component.model.ts"
  - "src/app/transaction-builder/builder-fields.ts"
  - "microservices/balance-component/src/service/balanceService.ts"
---

# A10 LC Close

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Contract

| Field | Value |
|---|---|
| Code | `A10` |
| Side | `IMPORT` |
| Instrument | `IPLC_LC` |
| Movement | `CLOSE` |
| Parent | — |
| Accounting | [[Transaction Accounting Matrix#Import transactions]] |
| Balance algorithm | [[Transaction Balance Calculation Matrix#Import transactions]] |

## Selection conditions

- 只顯示 server 判定 close-eligible 的 IPLC_LC。
- SG Balance=0、Acceptance Balance=0，整個 event tree 無 open events。
- Amount 由 current Confirmed Balance 帶入；Release 再驗證。

Picker 只提供候選提示；API 在 Maker Submit 與 Checker action 依該功能重新驗證，不信任過期的 UI snapshot。

## Source-defined behavior

Writes off whatever Confirmed Balance remains and retires the LC. Only LCs with Shipping Guarantee Balance = 0, Acceptance Balance = 0, and no open Events anywhere in the tree (including SG/Acceptance children) are shown below — redeem the SG (A9) and settle the Acceptance (A7) first if either is still outstanding. Amount is never typed — it is carried from the current Confirmed Balance and locked; 0 is a normal figure for an already fully-utilized LC. Once Released, this LC can no longer be selected by any other function.

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
