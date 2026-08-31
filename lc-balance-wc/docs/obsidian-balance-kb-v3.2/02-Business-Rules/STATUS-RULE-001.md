---
knowledge_id: STATUS-RULE-001
title: "PENDING 是唯一拥有多条外向合法动作路径的状态"
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

# STATUS-RULE-001 — PENDING 是唯一拥有多条外向合法动作路径的状态

## 状态
CONFIRMED

## 业务规则
Maker 刚创建的一笔变动记录处于 PENDING 状态，根据所采取的动作，可以转向以下四种状态之一：RELEASE→RELEASED，REJECT→REJECTED，CANCEL→CANCELLED，EDIT→SUPERSEDED。

## 触发条件
currentStatus === 'PENDING'

## 结果
RELEASE→RELEASED；REJECT→REJECTED；CANCEL→CANCELLED；EDIT→SUPERSEDED

## 示例
applyStatusTransition({currentStatus:'PENDING', action:'RELEASE', ...}) === 'RELEASED'

## 验证说明
直接阅读了 statusTransition.ts —— LEGAL_TRANSITIONS.PENDING 恰好包含所声称的四条记录。未降级。

## 来源证据

实现:
- `microservices/balance-component/src/domain/statusTransition.ts:23-29,45-53`

测试:
- `microservices/balance-component/test/unit/domain/statusTransition.test.ts:5-14`

## 相关知识
- [[Close Eligibility]]
- LEGAL_TRANSITIONS table
- applyStatusTransition()
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
