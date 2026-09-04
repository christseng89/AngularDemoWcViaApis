---
title: "B4 Honour / Acceptance"
type: function
domain: export
status: verified
source_of_truth: source-code
source_revision: "1865d80"
verified_date: 2026-09-04
generated: true
aliases: ["B4", "Honour / Acceptance"]
tags: ["function", "export"]
source_files:
  - "src/app/transaction-builder/balance-component.model.ts"
  - "src/app/transaction-builder/builder-fields.ts"
  - "microservices/balance-component/src/service/balanceService.ts"
---

# B4 Honour / Acceptance

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Contract

| Field | Value |
|---|---|
| Code | `B4` |
| Side | `EXPORT` |
| Instrument | `EPLC_CONFIRMATION` |
| Movement | `HONOUR` |
| Parent | — |
| Secondary reference | EB Number |
| Payable movement | `CREATE` |
| Accounting | [[Transaction Accounting Matrix#Export transactions]] |
| Balance algorithm | [[Transaction Balance Calculation Matrix#Export transactions]] |

## Selection conditions

- 先選 EPLC_CONFIRMATION，再選其下已 RELEASED、尚未 consumed 的 B3 Present Docs。
- Tenor 由 Confirmation 決定，不在 B4 重選。
- EB Number、amount 從 B3 帶入；沒有 eligible B3 時不可 Submit。

Picker 只提供候選提示；API 在 Maker Submit 與 Checker action 依該功能重新驗證，不信任過期的 UI snapshot。

## Source-defined behavior

The actual Honour/Accept legal event (cs-tf-balance-knowhow §7.4a/§7.6) — Sight vs Usance is read from the picked Confirmation's own Tenor Type (declared at B1), not re-asked here. Pick the Confirmation, then the already-RELEASED B3 (Present Docs) record under it (B3 must be genuinely Released first — go to B3 if nothing shows here) — EB Number and Amount are carried from it. Sight: Honours, releasing the Confirmation contingent and creating the Due from Issuing Bank asset (rationale §7.4a) — go to B5 to record the actual reimbursement later. Usance: Accepts, releasing the Confirmation contingent and creating BOTH the Acceptance liability AND its Reimbursement Receivable asset (rationale §7.6) — go to B5 at maturity too. Checker: one Release does the primary (Honour/Accept) and whichever secondary leg(s) that tenor needs, and consumes the B3 record's own Present Docs Earmark occupancy as a side effect.

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
