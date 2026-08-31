---
knowledge_id: MAKER-CHECKER-RULE-016
title: "唯有 B5 使用专属的可结算余额索引（EB Index）第二步选取器"
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

# MAKER-CHECKER-RULE-016 — 唯有 B5 使用专属的可结算余额索引（EB Index）第二步选取器

## 状态
CONFIRMED

## 业务规则
usesSettleableBalanceIndex 只有对 B5 才为 true——其第二步选取器展示的是仍处于未结清状态的可结算余额候选项，而不是 A4/A6 所使用的、单纯以仍处 PENDING 状态 movement 为对象的选取器。B5 的 EB Index 会合并两种可能 instrumentType 下的候选项。

## 适用条件
selectedFunction.code === 'B5'。

## 结果
selectionFlow.usesSettleableBalanceIndex === true，且仅此一种情形。

## 示例
B5 的 EB Index 会合并两种可能 instrumentType 下的候选项，这一点与 A4/A6 单纯的应付 movement 选取器不同。

## 核实说明
CLAUDE.md 自身关于前端 UI 决策的章节给予了佐证（"B5 的 EB Index 会合并两种可能 instrumentType 下的候选项"）。已确认。

## 来源证据

实现代码：
- `src/app/transaction-builder/function-strategy.ts:150-156`

测试：
- `src/app/transaction-builder/function-strategy.spec.ts:96-101`

## 相关知识
- [[Maker Checker Lifecycle]]
- FunctionStrategy 注册表（function-strategy.ts）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
