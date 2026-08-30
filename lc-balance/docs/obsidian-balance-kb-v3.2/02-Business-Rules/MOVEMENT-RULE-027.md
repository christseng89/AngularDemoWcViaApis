---
knowledge_id: MOVEMENT-RULE-027
title: "isAmendDecreaseDirection getter 将 A2 真正的 AMEND_DECREASE movementType 与 B2 带负号的 AMEND 统一归入同一个『减少』警示分类器"
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

# MOVEMENT-RULE-027 — isAmendDecreaseDirection getter 将 A2 真正的 AMEND_DECREASE movementType 与 B2 带负号的 AMEND 统一归入同一个『减少』警示分类器

## Status
CONFIRMED

## Business Rule
B2（出口信用证修改）没有独立的 AMEND_INCREASE/AMEND_DECREASE movementType——model.movementType 始终是 'AMEND'，方向改由 amendDirection（SubChoice，key 为 'amendDirection'）表达。isAmendDecreaseDirection 是唯一一个同时识别 A2 真正的 AMEND_DECREASE movementType，以及 B2 的『AMEND + amendDirection==='DECREASE'』组合的 getter，使下游的充足性警示逻辑能够统一对待这两种情况。

## Conditions
model.movementType === 'AMEND_DECREASE'，或（model.movementType === 'AMEND' 且 amendDirection === 'DECREASE'）

## Result
isAmendDecreaseDirection = true——触发与 A3 的 UTILIZE 相同的、基于 Tight-Available-Balance 的警示等级

## Example
在该 getter 出现之前，B2 自身的 Decrease 方向根本不会显示任何客户端余额警示，尽管服务端会拒绝超限的减少操作

## Verification Note
已直接阅读具体的 getter 实现；与声明内容逐字一致（两个条件均已确认）。

## Source Evidence

实现:
- `src/app/transaction-builder/maker-panel.component.ts:354-356`

测试:
- （未引用直接测试证据）

## Related Knowledge
- [[BalanceMovement]]
- checksAgainstTightAvailable / checksAgainstPlainAvailable getter
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
