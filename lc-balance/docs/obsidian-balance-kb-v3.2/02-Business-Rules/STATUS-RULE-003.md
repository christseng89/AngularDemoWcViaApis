---
knowledge_id: STATUS-RULE-003
title: "RELEASED、CANCELLED 与 SUPERSEDED 是终态"
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

# STATUS-RULE-003 — RELEASED、CANCELLED 与 SUPERSEDED 是终态

## 状态
CONFIRMED

## 业务规则
一笔变动记录一旦到达 RELEASED、CANCELLED 或 SUPERSEDED 状态，任何动作都属非法，均会抛出 IllegalStateTransitionError——该记录在状态机层面变为不可变；后续的更正必须通过状态机之外的新变动记录（例如 REVERSAL）来完成。

## 触发条件
currentStatus ∈ {RELEASED, CANCELLED, SUPERSEDED}

## 结果
无论请求的是何种动作，一律抛出 IllegalStateTransitionError

## 示例
applyStatusTransition({currentStatus:'RELEASED', action:'RELEASE', ...}) 抛出异常

## 验证说明
已核实——三个键在 LEGAL_TRANSITIONS 中均映射为 {}。未降级。

## 来源证据

实现:
- `microservices/balance-component/src/domain/statusTransition.ts:23-29`

测试:
- `microservices/balance-component/test/unit/domain/statusTransition.test.ts:21-25`

## 相关知识
- [[Close Eligibility]]
- LEGAL_TRANSITIONS table
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
