---
knowledge_id: two-layer-ledger-model-contract-vs-movement
title: "双层账本模型：Contract 与 Movement"
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

# 双层账本模型：Contract 与 Movement

持久化层被刻意拆分成正好两张业务表：balance_contracts 保存一份合约当前的静态属性（产品类型、自然键、币种、容差、状态），而 balance_movements 是一份仅可追加的账本，记录该合约上曾经发生过的每一个事件（ISSUE/AMEND/UTILIZE/HONOUR/……）。所有余额数字（Confirmed/Available/Tight Available Balance）都是即时从移动历史推导计算出来的，而不是缓存在合约行上。这样做是用查询时的聚合运算成本，换取彻底消除缓存与历史记录之间产生偏差的风险，也是整个 schema 之后所有设计所依赖的基础建模决策。

## 来源证据

- `Balance-Component-DB-Design.txt §2.1 (lines 62-72)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
