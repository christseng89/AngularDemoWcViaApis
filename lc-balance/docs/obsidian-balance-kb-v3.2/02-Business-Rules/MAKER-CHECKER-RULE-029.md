---
knowledge_id: MAKER-CHECKER-RULE-029
title: "复核队列的范围限定于所选功能自身可能产生的 movement"
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

# MAKER-CHECKER-RULE-029 — 复核队列的范围限定于所选功能自身可能产生的 movement

## 状态
CONFIRMED

## 业务规则
loadCheckerQueue() 会进一步以 movementTypeMatchesFunction(selectedFunction, movementType) 过滤每一个 PENDING 候选项，因此当某个 instrumentType 由多个功能共用时（例如 IPLC_LC：A1-A4），不会把不相关功能自身产生的 PENDING movement 泄漏到当前功能的复核队列中。

## 条件
已设定 selectedFunction；候选项的 movementType 不属于所选功能的 Strategy 所声明可产生的任何 movementType。

## 结果
无论 status/确认状态为何，候选项都会从 checkerItems 中被排除。

## 示例
即使某笔 LC 上同时存在 A3 的 UTILIZE PENDING，A2 自身的复核队列也不会显示该笔 UTILIZE。

## 验证说明
已由 CLAUDE.md 自身的决策日志条目逐字佐证（“各功能 RELEASE 自己产生的 PENDING 或 EARMARKING 交易”）。已确认。

## 来源证据

实现：
- `src/app/transaction-builder/checker-panel.component.ts:256-262,281`

测试：
- `src/app/transaction-builder/checker-panel.component.spec.ts:599-619`

## 相关知识
- [[Maker Checker Lifecycle]]
- 透过 movementTypeMatchesFunction 实现的各功能专属复核队列范围限定
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
