---
title: "A3 Document Arrival"
type: function
domain: import
status: verified
source_of_truth: source-code
source_revision: "1865d80"
verified_date: 2026-09-04
generated: true
aliases: ["A3", "Document Arrival"]
tags: ["function", "import"]
source_files:
  - "src/app/transaction-builder/balance-component.model.ts"
  - "src/app/transaction-builder/builder-fields.ts"
  - "microservices/balance-component/src/service/balanceService.ts"
---

# A3 Document Arrival

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Contract

| Field | Value |
|---|---|
| Code | `A3` |
| Side | `IMPORT` |
| Instrument | `IPLC_LC` |
| Movement | `UTILIZE` |
| Parent | — |
| Secondary reference | IB Number |
| Accounting | [[Transaction Accounting Matrix#Import transactions]] |
| Balance algorithm | [[Transaction Balance Calculation Matrix#Import transactions]] |

## Selection conditions

- 選 ACTIVE、Issue 已 RELEASED 的 IPLC_LC；Sight／Usance 都可。
- Amount 必須通過 Available／Tight Available 檢查。
- 若需以特定 outstanding SG 抵銷容量，應改選 A3S。

Picker 只提供候選提示；API 在 Maker Submit 與 Checker action 依該功能重新驗證，不信任過期的 UI snapshot。

## Source-defined behavior

Presentation Earmark (PENDING) for ANY tenor. Checker Approve here is an acknowledgment only — it does NOT finalize the LC Balance, which stays Pending either way. Go to A4 (Sight Settlement) if this LC is Sight, or A6 (Acceptance) if it's Usance — the LC's own declared Tenor Type (from A1 Issue) decides which. If this LC has an outstanding Shipping Guarantee reserving the capacity this arrival needs, use A3S instead — a plain A3 now hard-rejects past Tight Available (Design doc §6.1 v0.12).

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
