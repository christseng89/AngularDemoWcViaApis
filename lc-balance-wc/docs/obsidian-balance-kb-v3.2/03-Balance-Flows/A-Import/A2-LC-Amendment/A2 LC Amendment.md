---
title: "A2 LC Amendment"
type: function
domain: import
status: verified
source_of_truth: source-code
source_revision: "1865d80"
verified_date: 2026-09-04
generated: true
aliases: ["A2", "LC Amendment"]
tags: ["function", "import"]
source_files:
  - "src/app/transaction-builder/balance-component.model.ts"
  - "src/app/transaction-builder/builder-fields.ts"
  - "microservices/balance-component/src/service/balanceService.ts"
---

# A2 LC Amendment

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Contract

| Field | Value |
|---|---|
| Code | `A2` |
| Side | `IMPORT` |
| Instrument | `IPLC_LC` |
| Movement | 依 Direction |
| Parent | — |
| Secondary reference | Amendment No./Times |
| Accounting | [[Transaction Accounting Matrix#Import transactions]] |
| Balance algorithm | [[Transaction Balance Calculation Matrix#Import transactions]] |

## Selection conditions

- 一般 Increase／Decrease 選 ACTIVE IPLC_LC；Expiry Date 可選 ACTIVE 或 EXPIRED IPLC_LC。
- 必須先有 RELEASED Issue。
- Decrease 重查 Tight Available；EXPIRED 的 Expiry Extension 必須無 open events。

Picker 只提供候選提示；API 在 Maker Submit 與 Checker action 依該功能重新驗證，不信任過期的 UI snapshot。

## Source-defined behavior

Increase always succeeds; Decrease is checked against Tight Available Balance (Design doc §6.2) — only APPROVED amounts count, and outstanding off-balance-sheet exposure is netted out. Expiry Date (F1) amends the LC's own expiry date — against an EXPIRED LC, Checker Release also restores it to ACTIVE and reverses the AUTO EXPIRY write-off (a new Expiry Date in the future is required).

## Direction／Movement options

- Increase: `AMEND_INCREASE`
- Decrease: `AMEND_DECREASE`
- Expiry Date: `AMEND_EXPIRY_DATE`

## Processing boundary

欄位顯示、protected field、picker、submit shape 與 Checker routing 由 function catalog、builder field policies 與 service validation 共同決定。UI 不是權威驗證層；API 會重新驗證 contract、amount、currency、tenor、reference 與 lifecycle。

## Related

- [[Balance Sufficiency Rules]]
- [[Earmark Rules]]
- [[Maker Checker Lifecycle]]
- [[Linked Transaction Flows]]
- [[API Reference]]
