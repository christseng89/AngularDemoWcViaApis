---
title: "A7 Acceptance Settlement"
type: function
domain: import
status: verified
source_of_truth: source-code
source_revision: "c7e9884"
verified_date: 2026-09-03
generated: true
aliases: ["A7", "Acceptance Settlement"]
tags: ["function", "import"]
source_files:
  - "src/app/transaction-builder/balance-component.model.ts"
  - "src/app/transaction-builder/builder-fields.ts"
  - "microservices/balance-component/src/service/balanceService.ts"
---

# A7 Acceptance Settlement

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Contract

| Field | Value |
|---|---|
| Code | `A7` |
| Side | `IMPORT` |
| Instrument | `IPLC_ACCEPTANCE` |
| Movement | 依 Direction |
| Parent | `IPLC_LC` |
| Catalog tenor filter | `USANCE` |
| Accounting | [[Transaction Accounting Matrix#Import transactions]] |
| Balance algorithm | [[Transaction Balance Calculation Matrix#Import transactions]] |

## Selection conditions

- 第一層只顯示 Usance LC，而且至少有一筆 Available Balance 非 0 的 IPLC_ACCEPTANCE。
- 第二層再選特定 IB／Acceptance。
- Full／Partial Settlement 仍須通過即時 balance validation。

Picker 只提供候選提示；API 在 Maker Submit 與 Checker action 依該功能重新驗證，不信任過期的 UI snapshot。

## Source-defined behavior

Settlement Due Date — never touches the LC Balance itself (Cross-Reference Finding 1). Pick the LC below (LC Index — only LCs with an outstanding Acceptance Balance are shown), then the IB Number (IB Index) — a single LC can have multiple Document Arrivals.

## Direction／Movement options

- Full Settle: `FULL_SETTLE`
- Partial Settle: `PARTIAL_SETTLE`

## Processing boundary

欄位顯示、protected field、picker、submit shape 與 Checker routing 由 function catalog、builder field policies 與 service validation 共同決定。UI 不是權威驗證層；API 會重新驗證 contract、amount、currency、tenor、reference 與 lifecycle。

## Related

- [[Balance Sufficiency Rules]]
- [[Earmark Rules]]
- [[Maker Checker Lifecycle]]
- [[Linked Transaction Flows]]
- [[API Reference]]
