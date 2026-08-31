---
knowledge_id: STATUS-RULE-011
title: "(logicalContractId, contractVersion) 组合必须唯一"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - status
  - confirmed
---

# STATUS-RULE-011 — (logicalContractId, contractVersion) 组合必须唯一

## 状态
CONFIRMED

## 业务规则
针对给定 logicalContractId 的每一条合约版本记录，其 contractVersion 编号都必须互不相同，由一个与状态无关的唯一索引强制保证。

## 触发条件
idx_contracts_logical_version 建立在 (logical_contract_id, contract_version) 上的 UNIQUE 索引。

## 结果
重复的 (logicalContractId, contractVersion) 组合会抛出唯一约束冲突异常，与状态无关。

## 示例
两条同为 (lc-1, version 1) 的记录——一条 ACTIVE，一条 SUPERSEDED——即便仅凭那个只对 ACTIVE 生效的部分索引本身是允许的，这里仍会被拒绝。

## 验证说明
已在 schema.ts 中直接核实。适用与其姊妹规则「至多一个 ACTIVE 版本」相同的休眠状态注意事项——在真实使用中 contractVersion 始终为 1，因此该约束目前仅由直接的底层测试所触发，而不由任何实盘的修改流程触发。

## 来源证据

实现:
- `microservices/balance-component/src/db/schema.ts:107-109`

测试:
- `microservices/balance-component/test/unit/db/schema.test.ts:74-77`

## 相关知识
- [[Close Eligibility]]
- idx_contracts_logical_version
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
