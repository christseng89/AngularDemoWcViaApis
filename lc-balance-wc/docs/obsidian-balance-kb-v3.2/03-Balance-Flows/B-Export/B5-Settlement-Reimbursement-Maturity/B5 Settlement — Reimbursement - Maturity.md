---
title: "B5 Settlement — Reimbursement / Maturity"
type: function
domain: export
status: verified
source_of_truth: source-code
source_revision: "bad2f0c"
verified_date: 2026-09-03
generated: true
aliases: ["B5", "Settlement — Reimbursement / Maturity"]
tags: ["function", "export"]
source_files:
  - "src/app/transaction-builder/balance-component.model.ts"
  - "src/app/transaction-builder/builder-fields.ts"
  - "microservices/balance-component/src/service/balanceService.ts"
---

# B5 Settlement — Reimbursement / Maturity

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Contract

| Field | Value |
|---|---|
| Code | `B5` |
| Side | `EXPORT` |
| Instrument | `EPLC_ACCEPTANCE` |
| Movement | `FULL_SETTLE` |
| Parent | `EPLC_CONFIRMATION` |
| Catalog tenor filter | `USANCE` |
| Accounting | [[Transaction Accounting Matrix#Export transactions]] |
| Balance algorithm | [[Transaction Balance Calculation Matrix#Export transactions]] |

## Selection conditions

- 只選 Usance EPLC_CONFIRMATION。
- 第二層選擇具有 outstanding balance 的 EPLC_ACCEPTANCE／EB Number。
- 只處理 Acceptance maturity settlement，不選 Sight Due from Issuing Bank。

Picker 只提供候選提示；API 在 Maker Submit 與 Checker action 依該功能重新驗證，不信任過期的 UI snapshot。

## Source-defined behavior

Confirm LC Settlement — Usance held-to-maturity only (CNF_MATURE): settles the selected Acceptance only. B5 does not resolve or settle a matching Reimbursement Receivable. Pick the LC (LC Index, Usance only), then the EB Number (EB Index) — a single LC can have multiple Document Presentations. Sight settlement (Due from Issuing Bank) and reimbursement collection are outside this B5 flow.

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
