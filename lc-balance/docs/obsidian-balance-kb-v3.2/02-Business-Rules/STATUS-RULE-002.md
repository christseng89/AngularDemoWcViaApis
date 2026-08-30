---
knowledge_id: STATUS-RULE-002
title: "一笔已被 REJECTED 的变动记录仍可被 CANCELLED 或 EDIT，但永远不能被 RELEASED"
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

# STATUS-RULE-002 — 一笔已被 REJECTED 的变动记录仍可被 CANCELLED 或 EDIT，但永远不能被 RELEASED

## 状态
CONFIRMED

## 业务规则
一笔变动记录一旦被 REJECTED，就不能再次被释放——不存在 REJECTED→RELEASE 的路径；被拒绝的交易只能被取消或被替代（编辑/重新提交）。

## 触发条件
currentStatus === 'REJECTED'

## 结果
CANCEL→CANCELLED；EDIT→SUPERSEDED；RELEASE 与 REJECT 均会抛出 IllegalStateTransitionError

## 示例
applyStatusTransition({currentStatus:'REJECTED', action:'RELEASE', ...}) 抛出 IllegalStateTransitionError

## 验证说明
直接对照 LEGAL_TRANSITIONS.REJECTED = {CANCEL, EDIT}（仅此两项）核实无误。未降级。

## 来源证据

实现:
- `microservices/balance-component/src/domain/statusTransition.ts:23-29`

测试:
- `microservices/balance-component/test/unit/domain/statusTransition.test.ts:10-11,20-23`

## 相关知识
- [[Close Eligibility]]
- LEGAL_TRANSITIONS table
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
