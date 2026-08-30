---
knowledge_id: contingent-pair-lifecycle-establish-release
title: "或有负债配对生命周期（Establish／Release）"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# 或有负债配对生命周期（Establish／Release）

每一种范畴内的或有金融工具（信用证、SG、保兑）都遵循同一种双边生命周期形状：一个 Establish 事件会借记客户负债科目、贷记未清偿科目（使风险敞口增加），而一个 Release 事件则会将这同一对科目反向冲销（使风险敞口减少）——Issue／Amend-Increase 属于 Establish，Amend-Decrease／Honour／赎回／到期则属于 Release。承兑/DPU 影子备忘（Folio 3、5）在其各自独立的一对科目上，遵循完全相同的 Establish／Release 形状。

## 来源证据

- `analysis/contingent-liability-ledger.html Folios 1,2,4,5 row classes r-establish/r-release`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
