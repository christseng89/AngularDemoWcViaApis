---
knowledge_id: MAKER-CHECKER-RULE-018
title: "payExistingUtilizeFunctionFor 将较晚发生的 Release 时点事件解析为 A4，有别于 A3 的 Create 事件"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - maker-checker
  - confirmed
---

# MAKER-CHECKER-RULE-018 — payExistingUtilizeFunctionFor 将较晚发生的 Release 时点事件解析为 A4，有别于 A3 的 Create 事件

## 状态
CONFIRMED

## 业务规则
通用解析器一律将 IPLC_LC/UTILIZE 这对组合归属于 A3（即 Create/earmark 事件）。InquireEventsService 则改用 payExistingUtilizeFunctionFor()，用于处理一笔拆分后的即期（Sight）Document Arrival 时间轴记录中较晚发生的 Release/finalize 那一半，因为那实际上是 A4 自身真实的法律行为事件，而非 A3 的 earmark。

## 适用条件
instrumentType 恰好只有一个已注册功能满足 checkerRelease.releasesExistingMovementInPlace === true。

## 结果
IPLC_LC -> A4；SHGT 与 EPLC_CONFIRMATION -> undefined（不存在对应的出口版本）。

## 示例
payExistingUtilizeFunctionFor('IPLC_LC') -> A4；payExistingUtilizeFunctionFor('SHGT') -> undefined。

## 核实说明
CLAUDE.md 自身关于将时间轴记录拆分为 'create'/'finalize' 的决策日志条目给予了佐证。已确认。

## 来源证据

实现代码：
- `src/app/transaction-builder/function-strategy.ts:250-259`

测试：
- `src/app/transaction-builder/function-strategy.spec.ts:165-174`

## 相关知识
- [[Maker Checker Lifecycle]]
- movementTypeMatchesFunction / resolveFunctionForMovement Strategy 查找
- 一笔已终结的即期（Sight）Document Arrival 会拆分为 'create' + 'finalize' 两笔记录
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
