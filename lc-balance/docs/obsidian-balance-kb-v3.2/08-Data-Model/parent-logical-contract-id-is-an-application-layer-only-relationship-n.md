---
knowledge_id: parent-logical-contract-id-is-an-application-layer-only-relationship-n
title: "parent_logical_contract_id 只是应用层关系，不是数据库外键"
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

# parent_logical_contract_id 只是应用层关系，不是数据库外键

SHGT / Acceptance / EPLC_EXAMINATION 这些子合约，是透过 parent_logical_contract_id 引用其归属的 LC/Confirmation——但与合约版本链的连接以及移动的替代（supersession）/冲正（reversal）连接不同（后两者已在 2026-08-21 获得了真正的 FOREIGN KEY 约束），这个父子关系目前仍然只是纯粹依靠一个业务键在应用层维护，schema 本身并未声明任何外键约束。

## 来源证据

- `Balance-Component-DB-Design.txt §3 (lines 130-140), §4.1 row for parent_logical_contract_id (lines 171-173)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
