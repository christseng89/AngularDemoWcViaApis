---
knowledge_id: MOVEMENT-RULE-032
title: "处于'finalize'（终结）阶段的事件解析到其终结函数（A4/B4），而不是通用的产生动账函数（A3）"
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

# MOVEMENT-RULE-032 — 处于'finalize'（终结）阶段的事件解析到其终结函数（A4/B4），而不是通用的产生动账函数（A3）

## Status
CONFIRMED

## Business Rule
functionForEvent() 对 phase==='finalize' 做了特殊处理：此时会调用 payExistingUtilizeFunctionFor(contract.instrumentType)，而不是走通用的 resolveFunctionForMovement() 查找逻辑；原因在于，通用查找仅以 instrumentType+movementType 为键，即便是代表 A4 自身后续 Release 动作的那一行记录，也总会解析回该笔动账最初的创建方（A3）。

## Conditions
event.phase === 'finalize'

## Result
解析出的函数 = A4（进口）/对应的出口函数，而非 A3

## Example
同一笔 UTILIZE 动账，其 'create' 行解析为 A3，'finalize' 行解析为 A4

## Verification Note
直接阅读了函数体原文；与声明逐字相符（?? 兜底结构已确认）。

## Source Evidence

Implementation:
- `src/app/transaction-builder/inquire-events.service.ts:57-63`

Tests:
- `inquire-events.service.spec.ts:186,193`

## Related Knowledge
- [[BalanceMovement]]
- functionForEvent() / functionFor()（策略模式）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
