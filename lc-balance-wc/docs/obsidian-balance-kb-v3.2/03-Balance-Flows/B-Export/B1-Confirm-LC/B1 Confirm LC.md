---
title: "B1 Confirm LC"
type: function
domain: export
status: verified
source_of_truth: source-code
source_revision: "bad2f0c"
verified_date: 2026-09-03
generated: true
aliases: ["B1", "Confirm LC"]
tags: ["function", "export"]
source_files:
  - "src/app/transaction-builder/balance-component.model.ts"
  - "src/app/transaction-builder/builder-fields.ts"
  - "microservices/balance-component/src/service/balanceService.ts"
---

# B1 Confirm LC

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Contract

| Field | Value |
|---|---|
| Code | `B1` |
| Side | `EXPORT` |
| Instrument | `EPLC_CONFIRMATION` |
| Movement | `ISSUE` |
| Parent | — |
| Accounting | [[Transaction Accounting Matrix#Export transactions]] |
| Balance algorithm | [[Transaction Balance Calculation Matrix#Export transactions]] |

## Selection conditions

- 不選既有 contract；建立新的 Export Confirmation natural key。
- LC Number 不得已有 ACTIVE EPLC_CONFIRMATION。
- Expiry Date、currency、amount、tenor 等 Issue 必填資料必須有效。

Picker 只提供候選提示；API 在 Maker Submit 與 Checker action 依該功能重新驗證，不信任過期的 UI snapshot。

## Source-defined behavior

Adds this bank's own confirmation — an independent undertaking to the beneficiary, obligor = issuing bank (rationale §7.1). Plain advising (no confirmation) and Unconfirmed negotiation (EBL) are out of Balance Component scope — see the module note above. Tenor Type is the LC's own stated payment term, declared at confirmation (Design doc §7) — Sight or Usance only from the confirming bank's own perspective (Seller's/Buyer's Usance is an Import-side financing-structure distinction the confirming bank has no visibility into).

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
