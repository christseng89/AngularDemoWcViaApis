---
title: "A9 Shipping Gtee (Redemption)"
type: function
domain: import
status: verified
source_of_truth: source-code
source_revision: "c7e9884"
verified_date: 2026-09-03
generated: true
aliases: ["A9", "Shipping Gtee (Redemption)"]
tags: ["function", "import"]
source_files:
  - "src/app/transaction-builder/balance-component.model.ts"
  - "src/app/transaction-builder/builder-fields.ts"
  - "microservices/balance-component/src/service/balanceService.ts"
---

# A9 Shipping Gtee (Redemption)

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Contract

| Field | Value |
|---|---|
| Code | `A9` |
| Side | `IMPORT` |
| Instrument | `SHGT` |
| Movement | `FULL_REDEEM` |
| Parent | `IPLC_LC` |
| Accounting | [[Transaction Accounting Matrix#Import transactions]] |
| Balance algorithm | [[Transaction Balance Calculation Matrix#Import transactions]] |

## Selection conditions

- 先選 LC，再選其下具有 Available Balance 的特定 SHGT／SG Number。
- 只支援 Full Redeem；amount 由 SG current Available Balance 帶入並 protected。

Picker 只提供候選提示；API 在 Maker Submit 與 Checker action 依該功能重新驗證，不信任過期的 UI snapshot。

## Source-defined behavior

Search by LC Number + SG Number (below) — a single LC can have multiple Shipping Guarantees. Amount is carried from the SG's current Available Balance and protected (Full Redeem only) — Partial Redeem is no longer supported through this function. Design doc §6.1: redemption is NOT auto-linked to Document Arrival (A3) — it's a separate, explicit action.

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
