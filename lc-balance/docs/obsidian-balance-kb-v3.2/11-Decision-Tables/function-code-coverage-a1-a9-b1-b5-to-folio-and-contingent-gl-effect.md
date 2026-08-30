---
knowledge_id: function-code-coverage-a1-a9-b1-b5-to-folio-and-contingent-gl-effect
title: "功能代码覆盖范围——A1–A9/B1–B5 对应的 Folio 及或有负债总账影响"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 功能代码覆盖范围——A1–A9/B1–B5 对应的 Folio 及或有负债总账影响

| Code | Business Function（业务功能） | Contingent Folio(s)（对应的或有负债 Folio） | Contingent GL Effect（或有负债总账影响） |
|---|---|---|---|
| A1 | 进口 LC 开立 | Folio 1 | 按所声明的期限建立 LC 配对分录 |
| A2 | 进口 LC 修改 | Folio 1 | 建立（增额）/ 释放（减额） |
| A3 | 进口单据到达 | Folio 1 | 不产生或有负债影响——仅为操作性备忘，先于 A4/A6 发生 |
| A3S | 进口单据到达（附提货担保） | Folio 1 + Folio 2 | Submit 时不产生或有负债影响；SG 分支于 Checker Release 时释放 Folio 2 |
| A4 | 进口即期结算 | Folio 1 | 释放 LC 配对分录——即期 |
| A6 | 进口远期承兑 | Folio 1 + Folio 3 | 释放 LC 配对分录（BU/SU）并建立 Acceptance 影子备忘，作为一次复合释放 |
| A7 | 进口承兑结算 | Folio 3 | 释放 Acceptance 影子备忘 |
| A8 | 进口提货担保（开立） | Folio 2 | 建立 SG 配对分录 |
| A9 | 进口提货担保（赎回） | Folio 2 | 释放 SG 配对分录，全额或部分 |
| B1 | 出口保兑 LC | Folio 4 | 按所声明的期限建立 Confirmation 配对分录 |
| B2 | 出口保兑 LC 修改 | Folio 4 | 建立（增额）/ 释放（减额） |
| B3 | 出口交单 | Folio 4 | 不产生或有负债影响——仅为操作性备忘（MEMO_ONLY），先于 B4 发生 |
| B4 | 出口兑付/承兑 | Folio 4 + Folio 5 | 释放 Confirmation 配对分录（即期或远期），并且仅在远期情形下建立 Acceptance 影子备忘 |
| B5 | 出口结算——偿付/到期 | Folio 5 | 释放 Acceptance 影子备忘——仅远期 |

## Source Evidence

- `analysis/contingent-liability-ledger.html #coverage`

## Related Knowledge

- Contingent Liability Ledger (Dr/Cr Reference)
- [[Business-Rule-Index]]
