---
title: "B6 Confirmed LC Close"
type: function
domain: export
status: verified
source_of_truth: source-code
source_revision: "bad2f0c"
verified_date: 2026-09-03
generated: true
aliases: ["B6", "Confirmed LC Close"]
tags: ["function", "export"]
source_files:
  - "src/app/transaction-builder/balance-component.model.ts"
  - "src/app/transaction-builder/builder-fields.ts"
  - "microservices/balance-component/src/service/balanceService.ts"
---

# B6 Confirmed LC Close

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Contract

| Field | Value |
|---|---|
| Code | `B6` |
| Side | `EXPORT` |
| Instrument | `EPLC_CONFIRMATION` |
| Movement | `CLOSE` |
| Parent | — |
| Accounting | [[Transaction Accounting Matrix#Export transactions]] |
| Balance algorithm | [[Transaction Balance Calculation Matrix#Export transactions]] |

## Selection conditions

- 只顯示 server 判定 close-eligible 的 EPLC_CONFIRMATION。
- Acceptance Balance=0、無 open events，且不存在 RELEASED-but-unconsumed B3。
- Amount 由 current Confirmed Balance 帶入；Release 再驗證。

Picker 只提供候選提示；API 在 Maker Submit 與 Checker action 依該功能重新驗證，不信任過期的 UI snapshot。

## Source-defined behavior

Writes off whatever Confirmed Balance remains and retires the Confirmation. Only Confirmations with Acceptance Balance = 0 and no open Events anywhere in the tree — including a RELEASED-but-not-yet-consumed B3 Present Docs presentation (B4 has not Honoured/Accepted it yet) — are shown below; settle the Acceptance (B5) or complete B4 first if either is still outstanding. Amount is never typed — it is carried from the current Confirmed Balance and locked; 0 is a normal figure once every presentation has been fully honoured/accepted. Once Released, this Confirmation can no longer be selected by any other function.

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
