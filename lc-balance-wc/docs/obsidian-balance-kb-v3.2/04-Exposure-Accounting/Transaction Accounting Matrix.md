---
title: "Transaction Accounting Matrix"
type: reference
domain: accounting
status: verified
source_of_truth: source-code
source_revision: "bad2f0c"
verified_date: 2026-09-03
generated: true
aliases: []
tags: ["accounting", "transaction-matrix"]
source_files:
  - "microservices/balance-component/src/domain/contingentAccountEntry.ts"
  - "microservices/balance-component/src/domain/balanceDerivation.ts"
  - "microservices/balance-component/src/service/balanceService.ts"
  - "src/app/transaction-builder/maker-submit.service.ts"
---

# Transaction Accounting Matrix

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Reading rules

- 下表的 Dr／Cr 是 server-derived `contingentAccountEntry`，在 movement creation 時生成一次並持久化；Account Entries 畫面讀取該歷史 voucher，不重新計算。
- Runtime Balance Account Mapping 存在時，account number／description 取代下列 fallback family names，並保存 mapping key／version。
- `accountEntries` 是外送 downstream Accounting 的 payload。統一 posting gate 為：`EARMARKING`／`EARMARKED` 一律 `accountEntries=null`、不送；所有 `APPROVED` movement／leg 一律依其 Dr／Cr 送 Accounting。
- Compound business event 逐 leg 套用 posting gate；不得把 APPROVED leg 與 EARMARKED leg 合併成同一 posting 判斷。
- Direction=Decrease／Utilize／Settle／Redeem／Close／Expire 時，Dr／Cr 對調。零額 CLOSE／EXPIRE／REOPEN 不產生 placeholder voucher。

## Import transactions

| Function | Movement／leg | Internal voucher at creation | Completion／downstream boundary |
|---|---|---|---|
| A1 | IPLC_LC ISSUE | Dr Customers' Liability under DC；Cr Documentary Credits Outstanding（依 tenor suffix） | Maker=PENDING；Checker Release 後 APPROVED |
| A2 | AMEND_INCREASE／AMEND_DECREASE | Increase 同 A1；Decrease Dr／Cr 對調 | Expiry Date on ACTIVE 無 voucher；EXPIRED extension 產生原 EXPIRE 的反向 restoration voucher |
| A3 | IPLC_LC UTILIZE | Dr Documentary Credits Outstanding；Cr Customers' Liability under DC | 建立時為 EARMARKING／PENDING 虛帳；acknowledge 後 EARMARKED，尚未 Release；`accountEntries=null`，不送 Accounting |
| A3S | SHGT FULL_REDEEM + IPLC_LC UTILIZE | SG pair 對調 + LC pair 對調，兩 legs 同 business event | 逐 leg 判斷：APPROVED SG `FULL_REDEEM` leg 送 Accounting；EARMARKED LC arrival leg `accountEntries=null`、不送，留待 A4／A6 finalize |
| A4 | finalize existing A3/A3S UTILIZE | 不建立新 voucher；使用 A3/A3S 已保存的 LC UTILIZE voucher | Checker Release 同一 arrival movement，從 Pending 轉 APPROVED，並送 Accounting |
| A6 | IPLC_ACCEPTANCE CREATE + finalize arrival | Dr Acceptances & DPU — Customers' Liability (memo)；Cr Acceptances & DPU — Outstanding (memo) | 同一 Checker action 完成來源 arrival 與 Acceptance；成為 APPROVED 的各 leg 均送 Accounting |
| A7 | IPLC_ACCEPTANCE FULL/PARTIAL_SETTLE | Acceptance family Dr／Cr 對調 | 只結算所選 Acceptance，不改 LC Balance |
| A8 | SHGT ISSUE | Dr Customers' Liability under Shipping Guarantees；Cr Shipping Guarantees Outstanding | Checker Release 後 approved SG contingent |
| A9 | SHGT FULL_REDEEM | SG family Dr／Cr 對調 | Full redeem；不另行沖銷 A3 earmark |
| A10 | IPLC_LC CLOSE | LC family Dr／Cr 對調；amount=0 時無 voucher | Release 後 CLOSED |
| A11 | IPLC_LC REOPEN | LC family establishment direction；amount=0 時無 voucher | Restoration amount 由 write-off chain 推導 |

## Export transactions

| Function | Movement／leg | Internal voucher at creation | Completion／downstream boundary |
|---|---|---|---|
| B1 | EPLC_CONFIRMATION ISSUE | Dr Issuing Bank Confirmation Exposure；Cr Confirmation Undertakings Outstanding（Sight／Usance suffix） | Checker Release 後 approved Confirmation |
| B2 | EPLC_CONFIRMATION AMEND | Increase 使用 establishment pair；Decrease 對調 | Expiry Date 的 ACTIVE／EXPIRED semantics 同 A2 |
| B3 | EPLC_EXAMINATION CREATE | Dr Export Bills — Received, Under Examination (memo)；Cr Export Bills — Contra (memo) | EARMARKED internal memo only；`accountEntries=null`，不送下游 Accounting，也不建立 reversal |
| B4 Sight | Confirmation HONOUR + Due from Issuing Bank CREATE | HONOUR 對調 Confirmation pair；on-balance asset leg不產生 contingent voucher | compound release 並 consume B3 earmark |
| B4 Usance | Confirmation ACCEPT + EPLC_ACCEPTANCE CREATE + Reimbursement Receivable CREATE | ACCEPT 對調 Confirmation pair；Acceptance 建立 memo pair；receivable asset無 contingent pair | 三 legs 同 business event；consume B3 earmark |
| B5 | EPLC_ACCEPTANCE FULL_SETTLE | Export Acceptance memo family Dr／Cr 對調 | 不結算 Reimbursement Receivable |
| B6 | EPLC_CONFIRMATION CLOSE | Confirmation pair 對調；amount=0 時無 voucher | Release 後 CLOSED |
| B7 | EPLC_CONFIRMATION REOPEN | Confirmation establishment direction；amount=0 時無 voucher | Restoration amount 由 write-off chain 推導 |

## Automatic lifecycle

| Event | Voucher | Effect |
|---|---|---|
| Auto EXPIRE | 對調 root LC／Confirmation family；amount=Confirmed Balance | 真正 write-off，ACTIVE→EXPIRED |
| Auto CLOSE | 已 EXPIRED 後再次 CLOSE；通常 amount=0 因而無 voucher | status finalization，EXPIRED→CLOSED |

## Source boundary requiring external confirmation

Balance Component 的規則要求所有 APPROVED movement／leg 送出 `accountEntries`，並禁止 EARMARKING／EARMARKED legs 外送。外部 Accounting system 的 posting acknowledgement、retries、reconciliation 仍須由該 integration contract／service 補證。
