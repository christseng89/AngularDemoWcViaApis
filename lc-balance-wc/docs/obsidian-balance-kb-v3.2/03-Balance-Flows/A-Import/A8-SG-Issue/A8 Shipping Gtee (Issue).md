---
title: "A8 Shipping Gtee (Issue)"
type: function
domain: import
status: verified
source_of_truth: source-code
source_revision: "bad2f0c"
verified_date: 2026-09-03
generated: true
aliases: ["A8", "Shipping Gtee (Issue)"]
tags: ["function", "import"]
source_files:
  - "src/app/transaction-builder/balance-component.model.ts"
  - "src/app/transaction-builder/builder-fields.ts"
  - "microservices/balance-component/src/service/balanceService.ts"
---

# A8 Shipping Gtee (Issue)

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Contract

| Field | Value |
|---|---|
| Code | `A8` |
| Side | `IMPORT` |
| Instrument | `SHGT` |
| Movement | `ISSUE` |
| Parent | `IPLC_LC` |
| Accounting | [[Transaction Accounting Matrix#Import transactions]] |
| Balance algorithm | [[Transaction Balance Calculation Matrix#Import transactions]] |

## Selection conditions

- 選 ACTIVE、Issue 已 RELEASED 的 IPLC_LC 作 parent。
- SG Number 是新 SHGT natural key，不得與既有 ACTIVE SHGT 衝突。
- SG amount 不得超過 parent LC 當時 Available Balance。

Picker 只提供候選提示；API 在 Maker Submit 與 Checker action 依該功能重新驗證，不信任過期的 UI snapshot。

## Source-defined behavior

Independent contingent liability, issued against the LC as parent. Amount is capped at the parent LC's current Available Balance — rejected at Submit if exceeded (business instruction 2026-08-14, overriding the original LMTS-based sufficiency design). See Design doc §6.1 for the separate, non-blocking off-balance WARNING that also applies later against the LC's own UTILIZE. SG Number is SHGT's own natural key field (below), not a separate reference.

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
