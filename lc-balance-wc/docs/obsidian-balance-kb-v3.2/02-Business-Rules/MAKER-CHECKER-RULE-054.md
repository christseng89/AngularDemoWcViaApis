---
knowledge_id: MAKER-CHECKER-RULE-054
title: "自然键唯一性（re-ISSUE 防护）仅在应用层强制执行，而非通过数据库约束——未来的加固候选项"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - maker-checker
  - confirmed
---

# MAKER-CHECKER-RULE-054 — 自然键唯一性（re-ISSUE 防护）仅在应用层强制执行，而非通过数据库约束——未来的加固候选项

## 状态
CONFIRMED

## 业务规则
idx_contracts_naturalkey (instrument_type, lc_number, ib_number, sg_number, leg_seq) 只是一个普通的、非 UNIQUE 索引。防止针对一个已处于 ACTIVE 状态的合约、重复提交相同自然键的『创建型』movementType（即 re-ISSUE 防护，NaturalKeyAlreadyExistsError），完全是 createMovement() 中的一项应用层检查，而不是数据库层面的 UNIQUE 约束。

## 条件
针对一个已拥有 ACTIVE 合约的自然键，提交了一个创建型 movementType（例如 re-ISSUE）。

## 结果
应用层会在尝试任何数据库写入之前，抛出 NaturalKeyAlreadyExistsError；如果这道应用层检查被绕过或存在缺陷，数据库本身并不会拒绝重复的 ACTIVE 自然键。

## 示例
数据库设计文档自身将此标记为未来的加固候选项：如果确认该业务规则没有任何例外情形，可以将其转换为数据库层的局部 UNIQUE 索引（WHERE status='ACTIVE'），与 idx_contracts_one_active 的模式相呼应。

## 验证说明
这是上文合并后的『Re-ISSUE 防护』规则中，已经纳入的关于强制执行层级的具体细节。此处保留为一个独立可追溯的条目，指向数据库设计文档的引用，但应将其视为同一条合并规则的一部分，而非独立增量证据。

## 来源证据

实现：
- `Balance-Component-DB-Design.txt §8.4 (lines 795-802)`
- `Balance-Component-DB-Design.txt §4.1.1 idx_contracts_naturalkey row (lines 215-216)`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Maker Checker Lifecycle]]
- 自然键与代理键（Natural key vs surrogate key）共存
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
