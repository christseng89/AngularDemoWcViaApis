---
title: "B3 Present Docs"
type: function
domain: export
status: verified
source_of_truth: source-code
source_revision: "1865d80"
verified_date: 2026-09-04
generated: true
aliases: ["B3", "Present Docs"]
tags: ["function", "export"]
source_files:
  - "src/app/transaction-builder/balance-component.model.ts"
  - "src/app/transaction-builder/builder-fields.ts"
  - "microservices/balance-component/src/service/balanceService.ts"
---

# B3 Present Docs

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Contract

| Field | Value |
|---|---|
| Code | `B3` |
| Side | `EXPORT` |
| Instrument | `EPLC_EXAMINATION` |
| Movement | `CREATE` |
| Parent | `EPLC_CONFIRMATION` |
| Accounting | [[Transaction Accounting Matrix#Export transactions]] |
| Balance algorithm | [[Transaction Balance Calculation Matrix#Export transactions]] |

## Selection conditions

- 選 ACTIVE、Issue 已 RELEASED 的 EPLC_CONFIRMATION 作 parent。
- 新 EB Number 識別本次 EPLC_EXAMINATION presentation。
- Amount 必須在扣除尚未 consumed Present Docs earmark 後的容量內。

Picker 只提供候選提示；API 在 Maker Submit 與 Checker action 依該功能重新驗證，不信任過期的 UI snapshot。

## Source-defined behavior

Physical event only (cs-tf-balance-knowhow D3: "documents arriving... only legal events move balances") — creates a MEMO_ONLY examination earmark; the Confirmation itself stays completely untouched, Sight or Usance alike. Pick the Confirmation LC, type the EB Number for this presentation. Maker: Submit reserves it as PENDING. Checker: Release genuinely finalizes THIS record (PENDING -> RELEASED) — it still occupies Present Docs Earmark capacity until B4 (Honour / Acceptance) actually consumes it; skipping B4 leaves it RELEASED but never consumed.

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
