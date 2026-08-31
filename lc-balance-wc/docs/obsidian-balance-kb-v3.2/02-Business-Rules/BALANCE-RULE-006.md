---
knowledge_id: BALANCE-RULE-006
title: "在余额推导过程中，无法识别的 movementType 必须显式报错，绝不能默默按零影响处理"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - balance
  - confirmed
---

# BALANCE-RULE-006 — 在余额推导过程中，无法识别的 movementType 必须显式报错，绝不能默默按零影响处理

## 状态
CONFIRMED

## 业务规则
signedAmount()（被 computeConfirmedBalance/computeAvailableBalance/computePendingDecreaseTotal 使用）与 computeFaceAmount() 在 MOVEMENT_DIRECTION 中找不到某笔变动记录的 movementType 对应条目时，都会抛出一个普通的 Error，而不是默默地在求和中贡献 0。

## 触发条件
MOVEMENT_DIRECTION[movement.movementType] === undefined

## 结果
抛出 Error('MOVEMENT_DIRECTION has no entry for movementType ...')

## 示例
computeConfirmedBalance([{movementType:'SOME_UNKNOWN_TYPE', status:'RELEASED', ...}]) 会抛出异常

## 验证说明
单一来源，直接重新阅读；代码与测试完全一致。未降级。

## 来源证据

实现:
- `microservices/balance-component/src/domain/balanceDerivation.ts:57-63,111-114`

测试:
- `microservices/balance-component/test/unit/domain/balanceDerivation.test.ts:20-23`

## 相关知识
- [[Balance Derivation Rules]]
- MOVEMENT_DIRECTION 查找表
- signedAmount() 辅助函数
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
