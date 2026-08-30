---
knowledge_id: folio-3-import-acceptance-contingent-liability-shadow-memo-only-exposu
title: "Folio 3 — 进口承兑或有负债（仅影子备忘，exposureNature=ACTUAL，不按期限分类）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# Folio 3 — 进口承兑或有负债（仅影子备忘，exposureNature=ACTUAL，不按期限分类）

| Tenor Type（期限类型） | Lifecycle / Event（生命周期/事件） | Function · MovementType | GL Effect（总账影响） | Debit Account（借方账户） | Credit Account（贷方账户） |
|---|---|---|---|---|---|
| 买方远期（存在分歧——规范文件称 BU 本不应到达此 folio） | 承兑记录创建 | A6 · CREATE | 建立（影子记录） | Acceptances & DPU — Customers' Liability（备忘） | Acceptances & DPU — Outstanding（备忘） |
| 买方远期 | 到期/结算 | A7 · FULL_SETTLE / PARTIAL_SETTLE | 释放（影子记录） | Acceptances & DPU — Outstanding（备忘） | Acceptances & DPU — Customers' Liability（备忘） |
| 卖方远期 | 承兑记录创建（与 Folio 1 自身 A6 的 LC 配对释放复合发生） | A6 · CREATE | 建立（影子记录） | Acceptances & DPU — Customers' Liability（备忘） | Acceptances & DPU — Outstanding（备忘） |
| 卖方远期 | 到期/结算 | A7 · FULL_SETTLE / PARTIAL_SETTLE | 释放（影子记录） | Acceptances & DPU — Outstanding（备忘） | Acceptances & DPU — Customers' Liability（备忘） |

## Source Evidence

- `analysis/contingent-liability-ledger.html #folio-3`

## Related Knowledge

- Contingent Liability Ledger (Dr/Cr Reference)
- [[Business-Rule-Index]]
