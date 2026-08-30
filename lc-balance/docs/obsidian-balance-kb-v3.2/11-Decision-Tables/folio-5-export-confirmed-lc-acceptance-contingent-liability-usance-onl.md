---
knowledge_id: folio-5-export-confirmed-lc-acceptance-contingent-liability-usance-onl
title: "Folio 5 — 出口保兑 LC 承兑或有负债（仅远期——无即期行；仅影子备忘）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# Folio 5 — 出口保兑 LC 承兑或有负债（仅远期——无即期行；仅影子备忘）

| Tenor Type（期限类型） | Lifecycle / Event（生命周期/事件） | Function · MovementType | GL Effect（总账影响） | Debit Account（借方账户） | Credit Account（贷方账户） |
|---|---|---|---|---|---|
| 远期（即期永远不适用——即期兑付直接结算为表内 Due-from-Issuing-Bank 资产，完全不产生负债侧分录） | 承兑记录创建（与 Folio 4 自身的 B4 ACCEPT 分支复合发生） | B4 · ACCEPT（远期分支） | 建立（影子记录） | Confirmed Acceptances & DPU — Customers' Liability（备忘） | Confirmed Acceptances & DPU — Outstanding（备忘） |
| 远期 | 结算——持有至到期或到期前贴现（两者映射逻辑相同） | B5 · FULL_SETTLE / PARTIAL_SETTLE | 释放（影子记录） | Confirmed Acceptances & DPU — Outstanding（备忘） | Confirmed Acceptances & DPU — Customers' Liability（备忘） |

## Source Evidence

- `analysis/contingent-liability-ledger.html #folio-5`

## Related Knowledge

- Contingent Liability Ledger (Dr/Cr Reference)
- [[Business-Rule-Index]]
