---
knowledge_id: MOVEMENT-RULE-026
title: "B2 的方向通过 subChoice.key='amendDirection' 传递，绝不通过独立的 movementType 或被修改的 model.amount 传递"
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

# MOVEMENT-RULE-026 — B2 的方向通过 subChoice.key='amendDirection' 传递，绝不通过独立的 movementType 或被修改的 model.amount 传递

## Status
CONFIRMED

## Business Rule
B2 自身的 movementType 始终是固定字面量 'AMEND'；Increase/Decrease（增加/减少）通过一个不同于 movementType 的 subChoice 写入目标来表达。符号转换（Decrease 对应负的电文金额）仅发生在 buildSubmitRequest() 内部；model.amount 本身绝不会被修改，因此实时 Formly Amount 输入框始终持续显示 Maker 所输入的正数值。

## Conditions
selectedFunction.subChoice?.key === 'amendDirection'

## Result
Submit 时若缺少 amendDirection -> 失败；若存在 -> buildSubmitRequest() 计算 wireAmount = ±Math.abs(model.amount)；model.amount 保持不变

## Example
model.amount='5000'，amendDirection='DECREASE' -> request.amount='-5000'，model.amount 仍为 '5000'

## Verification Note
已直接阅读 validateSubmit() 中的守卫逻辑以及 buildSubmitRequest() 中 wireAmount 的具体计算方式；与声明内容完全一致，包括源码注释中明确表达的『不修改 model.amount』这一设计意图。

## Source Evidence

实现:
- `src/app/transaction-builder/submit-rules.ts:149-156,168-176`

测试:
- `submit-rules.spec.ts:608-650`

## Related Knowledge
- [[BalanceMovement]]
- B2 方向/带符号金额处理
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
