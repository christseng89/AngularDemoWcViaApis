---
knowledge_id: MOVEMENT-RULE-017
title: "B2（出口信用证修改）展示用的方向/幅度去符号化处理——AMEND_INCREASE/AMEND_DECREASE 从电文金额自身的正负号推导而来"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - movement
  - confirmed
---

# MOVEMENT-RULE-017 — B2（出口信用证修改）展示用的方向/幅度去符号化处理——AMEND_INCREASE/AMEND_DECREASE 从电文金额自身的正负号推导而来

## Status
CONFIRMED

## Business Rule
EPLC_CONFIRMATION 共用的 AMEND movementType（B2）并没有独立的 AMEND_INCREASE/AMEND_DECREASE 取值——方向由电文金额的正负号决定。displayMovementType()/displayMovementAmount() 会为列表/详情视图重建面向读者的区分展示，但绝不会修改底层的模型/电文数值本身。其余所有 (instrumentType, movementType) 组合均原样透传，不做任何改动。

## Conditions
instrumentType === 'EPLC_CONFIRMATION' 且 movementType === 'AMEND'

## Result
displayMovementType()：amount >= 0（含恰好为 0）-> 'AMEND_INCREASE'；amount < 0 -> 'AMEND_DECREASE'。displayMovementAmount()：两种情况下都返回 Math.abs(amount) 的字符串形式

## Example
displayMovementType('EPLC_CONFIRMATION','AMEND','-7000') -> 'AMEND_DECREASE'；displayMovementAmount(...) -> '7000'

## Verification Note
已直接阅读完整函数实现；与声明内容逐字一致，包括『恰好为 0 视为 INCREASE』这一边界情况。

## Source Evidence

实现:
- `src/app/transaction-builder/balance-component.model.ts:666-687`

测试:
- `balance-component.model.spec.ts:683-718`

## Related Knowledge
- [[BalanceMovement]]
- displayMovementType()
- displayMovementAmount()
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
