---
title: "B2 Confirm LC Amendment"
type: function
domain: export
status: verified
source_of_truth: source-code
source_revision: "1865d80"
verified_date: 2026-09-04
generated: true
aliases: ["B2", "Confirm LC Amendment"]
tags: ["function", "export"]
source_files:
  - "src/app/transaction-builder/balance-component.model.ts"
  - "src/app/transaction-builder/builder-fields.ts"
  - "microservices/balance-component/src/service/balanceService.ts"
---

# B2 Confirm LC Amendment

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Contract

| Field | Value |
|---|---|
| Code | `B2` |
| Side | `EXPORT` |
| Instrument | `EPLC_CONFIRMATION` |
| Movement | `AMEND` |
| Parent | — |
| Secondary reference | Amendment No./Times |
| Accounting | [[Transaction Accounting Matrix#Export transactions]] |
| Balance algorithm | [[Transaction Balance Calculation Matrix#Export transactions]] |

## Selection conditions

- 一般 Increase／Decrease 選 ACTIVE EPLC_CONFIRMATION；Expiry Date 可選 ACTIVE 或 EXPIRED Confirmation。
- 必須先有 RELEASED B1 Issue。
- Decrease／Expiry Extension 在 Submit 與 Release 都重新驗證。

Picker 只提供候選提示；API 在 Maker Submit 與 Checker action 依該功能重新驗證，不信任過期的 UI snapshot。

## Source-defined behavior

Adjusts confirmed_amount — rationale §7.2: a confirming bank may advise an amendment WITHOUT extending its confirmation (Art. 10(b)), so confirmed_amount can genuinely diverge from the LC's own face amount. This function only ever moves the Confirmation's own contingent. Amount stays a positive magnitude — Direction (above), not the amount's own sign, carries Increase vs. Decrease. Expiry Date (F1) amends the Confirmation's own expiry date — against an EXPIRED Confirmation, Checker Release also restores it to ACTIVE and reverses the AUTO EXPIRY write-off (a new Expiry Date in the future is required).

## Direction／Movement options

- Increase: `INCREASE`
- Decrease: `DECREASE`
- Expiry Date: `AMEND_EXPIRY_DATE`

## Processing boundary

欄位顯示、protected field、picker、submit shape 與 Checker routing 由 function catalog、builder field policies 與 service validation 共同決定。UI 不是權威驗證層；API 會重新驗證 contract、amount、currency、tenor、reference 與 lifecycle。

## Related

- [[Balance Sufficiency Rules]]
- [[Earmark Rules]]
- [[Maker Checker Lifecycle]]
- [[Linked Transaction Flows]]
- [[API Reference]]
