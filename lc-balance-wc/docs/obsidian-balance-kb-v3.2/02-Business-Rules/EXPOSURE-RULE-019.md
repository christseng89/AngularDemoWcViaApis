---
knowledge_id: EXPOSURE-RULE-019
title: "Acceptance/DPU 是一笔影子备忘分录，而非真正的或有科目类型——真实负债属于表内且不在范畴内"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 分析快照中没有 .git 历史记录，参见 [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - exposure
  - confirmed
---

# EXPOSURE-RULE-019 — Acceptance/DPU 是一笔影子备忘分录，而非真正的或有科目类型——真实负债属于表内且不在范畴内

## 状态
CONFIRMED

## 业务规则
一旦汇票被承兑或产生 DPU，其背后的敞口就不再是或有性质，而是依据 IFRS 9 变为一项表内金融负债。为 Acceptance 显示的 Dr/Cr 配对（Folio 3 与 Folio 5，「Acceptances & DPU — Customers' Liability / Outstanding (memo)」）只是一笔用于 MIS/MT 对账的报告用影子分录——从来不是真实的会计记录。Balance Component 自身的领域模型也体现了这一点：Acceptance 异动被标记为 exposureNature=ACTUAL，而非 CONTINGENT。

## 条件
movementType 是针对 IPLC_ACCEPTANCE 或 EPLC_ACCEPTANCE 的 CREATE/FULL_SETTLE/PARTIAL_SETTLE。

## 结果
会过账一笔标记为 exposureNature=ACTUAL 的影子 Dr/Cr 配对，区别于标记为 CONTINGENT 的 LC/SG/Confirmation 配对；本组件不会生成真正的表内 Acceptance 负债分录。

## 示例
针对 Buyer 的 Usance Import Acceptance 执行 A6 CREATE 会过账一笔影子备忘配对；真实的 Acceptances & DPU Outstanding 负债及其对应应收，由另一个不在范畴内的组件负责入账。

## 验证说明
已直接对照 ledger.html 源文件核实。与另一份「design-docs-spec」候选（主题相关但非重复）——那一份来自 Lifecycle 规格书自身 §3.7，说明「为何」它属于表内的原理，而本条记录的是 Balance Component 实际「实现了」什么——保留为两条独立、相互交叉引用的规则，而非合并，因为一份讲原理、一份讲实现，合并会模糊这一区别。

## 原始码证据

实现：
- `analysis/contingent-liability-ledger.html Folio 3/5 .callout (grep 核实，第 574 行：'an Acceptance movement is tagged exposureNature = ACTUAL, not CONTINGENT')`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- Acceptance/DPU 在承兑发生的当下即以表内、全额方式确认（TF_Contingent_Liability_Lifecycle §3.7，为佐证性设计文档规则）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
