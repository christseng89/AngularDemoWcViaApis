---
knowledge_id: STATUS-RULE-007
title: "关闭释放的副作用 —— 合约转为 CLOSED 状态并被锁定、无法再进行后续动作"
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

# STATUS-RULE-007 — 关闭释放的副作用 —— 合约转为 CLOSED 状态并被锁定、无法再进行后续动作

## 状态
CONFIRMED

## 业务规则
当一笔 CLOSE 变动记录被释放时，合约的 ContractStatus 会转为 CLOSED（markClosed()）——该状态自最初设计起就已在 types.ts 中预留，但此前从未在任何地方被真正设置过。一个 CLOSED 状态的合约，不再能通过任何依赖交易创建功能所使用的仅限 ACTIVE 的自然键查找方式解析出来，但仍可通过用于查询用途的双解析器路径（includeAnyStatus=true）解析出来。

## 触发条件
在 release() 成功更新其状态那一刻，movement.movementType === 'CLOSE'。

## 结果
调用 contracts.markClosed(balanceContractId, releasedAt)；此后针对该自然键的 createMovement() 调用会抛出 NotFoundError。

## 示例
CLOSE-A10-008：关闭被释放后，尝试经由自然键查找发起 AMEND_INCREASE 会抛出 NotFoundError。

## 验证说明
直接阅读了 release() 自身的 CLOSE 分支——markClosed() 的调用方式与所述完全一致。Balance-Figures-Calculation-Logic.txt 自身的 A10/B6 表格（『合约状态：本应保持不变，仍为 ACTIVE → ACTIVE→CLOSED（副作用）』）以及 api-specs 候选项，从设计文档/规格层面提供了佐证；已折叠为佐证证据，而非另立近似重复条目。

## 来源证据

实现:
- `microservices/balance-component/src/service/balanceService.ts:1259-1266`

测试:
- `microservices/balance-component/test/unit/service/closeFunction.test.ts:47-72,257-283`

## 相关知识
- [[Close Eligibility]]
- release()'s CLOSE-specific side effect
- markClosed()
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
