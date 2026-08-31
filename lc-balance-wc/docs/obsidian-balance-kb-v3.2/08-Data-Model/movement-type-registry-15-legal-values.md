---
knowledge_id: movement-type-registry-15-legal-values
title: "movement_type 登记表——15 个合法值"
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

# movement_type 登记表——15 个合法值

movement_type 这条 CHECK 约束的合法值清单，与 BalanceService 的 buildMovementTypeRegistry() 完全一致：ISSUE、CREATE、AMEND_INCREASE、AMEND、AMEND_DECREASE、UTILIZE、HONOUR、ACCEPT、PARTIAL_REDEEM、FULL_REDEEM、REIMBURSE、RECLASSIFY_OUT、PARTIAL_SETTLE、FULL_SETTLE、CLOSE（CLOSE 于 2026-08-21 为 A10/B6 新增）。

## 来源证据

- `Balance-Component-DB-Design.txt §5.6 table (lines 593-627)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
