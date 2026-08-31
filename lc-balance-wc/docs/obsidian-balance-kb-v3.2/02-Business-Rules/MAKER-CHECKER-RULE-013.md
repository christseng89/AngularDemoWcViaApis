---
knowledge_id: MAKER-CHECKER-RULE-013
title: "FunctionStrategy 注册表是 4 项各功能行为维度（movement 推导、复合提交、Checker 放行、选取流程）的唯一真实来源"
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

# MAKER-CHECKER-RULE-013 — FunctionStrategy 注册表是 4 项各功能行为维度（movement 推导、复合提交、Checker 放行、选取流程）的唯一真实来源

## 状态
CONFIRMED

## 业务规则
每一个 A1-A10/B1-B6 功能的 movement 推导、复合提交、Checker 放行与选取流程行为，都是从 FUNCTION_STRATEGIES[code] 查找得出，而不是像 F-01 之前的设计那样，散落在各消费端档案中的临时布尔旗标。一个不具备任何特殊行为的功能，会得到 NO_SPECIAL_BEHAVIOR（所有旗标均为 false/null，shape 为 'plain'）。原本 TransactionFunction 上的 11 个布尔旗标，在此次迁移（F-01，共 5 个 PR，先写特性化测试）之后已从注册表中彻底移除。

## 适用条件
功能代码为已注册代码之一（A1-A10/B1-B6）。

## 结果
deriveFunctionStrategy(fn) 返回一个全新的 FunctionStrategy 对象，其 movementDerivation/compoundSubmission/checkerRelease/selectionFlow 均已完整填充。

## 示例
A9 -> movementDerivation.amountVsAvailableDerivation='REDEEM'；B4 -> checkerRelease.settlesDocumentArrival=true 且 sourceAlreadyReleasedBeforePick=true。

## 核实说明
CLAUDE.md 自身关于 F-01 的决策日志条目对同一套 5-PR 迁移过程及旗标移除结果给予了有力佐证。已确认。

## 来源证据

实现代码：
- `src/app/transaction-builder/function-strategy.ts:60-183`

测试：
- `src/app/transaction-builder/function-strategy.spec.ts:8-110`

## 相关知识
- [[Maker Checker Lifecycle]]
- FunctionStrategy 注册表（function-strategy.ts）
- desiger-comments.md 中的 F-01 Strategy 重构
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
