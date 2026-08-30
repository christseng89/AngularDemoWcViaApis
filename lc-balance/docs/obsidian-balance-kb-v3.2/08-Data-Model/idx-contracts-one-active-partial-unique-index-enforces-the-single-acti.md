---
knowledge_id: idx-contracts-one-active-partial-unique-index-enforces-the-single-acti
title: "idx_contracts_one_active 部分唯一索引在数据库层强制保证“单一 ACTIVE 版本”不变式"
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

# idx_contracts_one_active 部分唯一索引在数据库层强制保证“单一 ACTIVE 版本”不变式

一个建立在 (logical_contract_id) 上、条件为 status='ACTIVE' 的部分 UNIQUE 索引，在数据库层——而不仅仅依靠应用层“先检查再插入”的逻辑——保证任意时刻同一个逻辑合约最多只能有一个 ACTIVE 版本。数据库优化评审明确指出，这种方式比应用层的“先检查再插入”模式更可靠，并将其视为版本链模型中最关键的单一数据完整性约束。

## 来源证据

- `Balance-Component-DB-Design.txt §2.4 (lines 101-104), §4.1.1 (lines 211-213)`
- `Balance-Component-DB-Optimization-Analysis.txt §1 (lines 23-26)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
