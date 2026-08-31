---
knowledge_id: balance-movements-table-growth-pattern-repeated-alter-table-for-new-xx
title: "balance_movements 表的增长模式：为新增的 xxx_by/xxx_at 角色-动作列反复执行 ALTER TABLE"
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

# balance_movements 表的增长模式：为新增的 xxx_by/xxx_at 角色-动作列反复执行 ALTER TABLE

在 13 个迁移中，至少有 5 个（加上最初的 released_by/released_at 列）遵循完全相同的模式：每当引入一个新的 Maker/Checker 角色-动作（acknowledged、maker_submitted、present_docs_consumed、cancelled）时，就新增一对 actor/timestamp 列。再加上 7 个 JSON 快照列，该表已经增长到 47 个列，且这种增长模式预计还会继续。数据库优化评审将此标记为"本应规范化为事件表、却被拍平成稀疏列"的信号，并建议未来引入 movement_actions(movement_id, action_type, actor, occurred_at) 和 movement_snapshots(movement_id, snapshot_type, payload_json) 两张表——并明确说明这一改动会与未来的 PostgreSQL 迁移一并进行，而不是作为独立的 SQLite 变更单独实施。

## 来源证据

- `Balance-Component-DB-Optimization-Analysis.txt P1 section (lines 70-102)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
