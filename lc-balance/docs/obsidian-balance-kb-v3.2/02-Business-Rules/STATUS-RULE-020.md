---
knowledge_id: STATUS-RULE-020
title: "『finalize』阶段的记录行永远不会被视为预留（earmark），即使 (instrumentType, movementType) 组合完全相同"
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

# STATUS-RULE-020 — 『finalize』阶段的记录行永远不会被视为预留（earmark），即使 (instrumentType, movementType) 组合完全相同

## 状态
CONFIRMED

## 业务规则
当一笔已终结的即期单据到单（Sight Document Arrival）拆分为一笔『create』记录行（A3 的历史提交）与一笔『finalize』记录行（A4 的真实法律事件释放）、且二者共享完全相同的 (IPLC_LC, UTILIZE) 身份时，『finalize』记录行永远显示为普通的 PENDING/APPROVED，而不会是 EARMARKING/EARMARKED。

## 条件
phase === 'finalize'，依代码自身的守卫逻辑无条件成立——并不局限于 IPLC_LC/UTILIZE。

## 结果
对于任何 'finalize' 阶段的记录行，isEarmarkFunction() 都返回 false。

## 示例
isEarmarkFunction('IPLC_LC','UTILIZE','finalize') === false，即使相同组合下 isEarmarkFunction('IPLC_LC','UTILIZE','create') === true。

## 验证说明
直接阅读了守卫逻辑——`if (phase === 'finalize') return false;` 在 instrumentType/movementType 检查之前就已触发，与声明完全一致。未降级。

## 来源证据

实现：
- `src/app/transaction-builder/balance-component.model.ts:539`

测试：
- `src/app/transaction-builder/balance-component.model.spec.ts:664-678`

## 相关知识
- [[Close Eligibility]]
- [[isearmarkfunction|isEarmarkFunction()]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
