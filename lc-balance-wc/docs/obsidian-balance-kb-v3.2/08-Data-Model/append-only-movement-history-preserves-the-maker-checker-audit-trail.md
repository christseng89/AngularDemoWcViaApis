---
knowledge_id: append-only-movement-history-preserves-the-maker-checker-audit-trail
title: "只追加式流水历史保留 Maker/Checker 审计轨迹"
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

# 只追加式流水历史保留 Maker/Checker 审计轨迹

balance_movements 的行从不会被物理删除；一旦插入，之后只会更新 status 列以及一小组审计列（released_by/_at、cancelled_by/_at、maker_submitted_by/_at、present_docs_consumed_by/_at、acknowledged_by/_at）。正是这一点使得"当前合约状态 = 从第一笔到最后一笔流水重新计算"成为一种有效、可信赖的设计，也正是这一机制让系统拥有完整的 Maker/Checker 审计轨迹，而不是一份可变的当前状态记录。

## 来源证据

- `Balance-Component-DB-Design.txt §2.2 (lines 74-81)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
