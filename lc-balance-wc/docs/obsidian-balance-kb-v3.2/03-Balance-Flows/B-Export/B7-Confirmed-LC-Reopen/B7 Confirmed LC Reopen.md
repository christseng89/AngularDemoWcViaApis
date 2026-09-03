---
title: "B7 Confirmed LC Reopen"
type: function
domain: export
status: verified
source_of_truth: source-code
source_revision: "bad2f0c"
verified_date: 2026-09-03
generated: true
aliases: ["B7", "Confirmed LC Reopen"]
tags: ["function", "export"]
source_files:
  - "src/app/transaction-builder/balance-component.model.ts"
  - "src/app/transaction-builder/builder-fields.ts"
  - "microservices/balance-component/src/service/balanceService.ts"
---

# B7 Confirmed LC Reopen

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Contract

| Field | Value |
|---|---|
| Code | `B7` |
| Side | `EXPORT` |
| Instrument | `EPLC_CONFIRMATION` |
| Movement | `REOPEN` |
| Parent | — |
| Accounting | [[Transaction Accounting Matrix#Export transactions]] |
| Balance algorithm | [[Transaction Balance Calculation Matrix#Export transactions]] |

## Selection conditions

- 只解析 CLOSED EPLC_CONFIRMATION。
- 整個 event tree 必須無 open events。
- Restoration amount 由 trailing RELEASED EXPIRE／CLOSE chain 計算，不由 Maker 輸入。

Picker 只提供候選提示；API 在 Maker Submit 與 Checker action 依該功能重新驗證，不信任過期的 UI snapshot。

## Source-defined behavior

Reopens a CLOSED Confirmation — restores whatever Confirmed Balance it had immediately before its EXPIRE/CLOSE write-off chain (sums every not-yet-reversed EXPIRE/CLOSE movement in its history, not only the last one). Only CLOSED Confirmations with no open Events anywhere in the tree are shown below. Status returns to ACTIVE, or to EXPIRED if the original Expiry Date has since passed (use B2's "Expiry Date" option afterward to extend it). No Amount to type — the server derives it from the Confirmation's own balance history at Submit and generates a real Account Entries pair immediately, so the Checker reviews the actual restoration BEFORE approving it.

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
