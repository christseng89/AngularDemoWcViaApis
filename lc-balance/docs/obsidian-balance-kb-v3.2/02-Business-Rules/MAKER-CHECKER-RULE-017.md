---
knowledge_id: MAKER-CHECKER-RULE-017
title: "resolveFunctionForMovement 对于两个功能共用的 movement 形态，存在一项已知且已被接受的、仅影响显示的模糊性"
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

# MAKER-CHECKER-RULE-017 — resolveFunctionForMovement 对于两个功能共用的 movement 形态，存在一项已知且已被接受的、仅影响显示的模糊性

## 状态
CONFIRMED

## 业务规则
IPLC_LC/UTILIZE 同时可由 A3 和 A3S 产生（movementType 字面值完全相同）；SHGT/FULL_REDEEM 同时可由 A9 和 A3S 自身的对应段产生。该解析器会确定性地返回注册表中第一个匹配项（分别为 A3、A9）——这只会影响 Inquire Events 显示的功能代码徽章，绝不影响重建出来的数据本身，因为无论哪种情形，栏位集合都是相同的。这是一项已被明确接受的局限，而非缺陷。

## 适用条件
instrumentType/movementType 组合匹配到一个以上的已注册功能。

## 结果
以注册顺序中较靠前者胜出。

## 示例
resolveFunctionForMovement('IPLC_LC','UTILIZE') -> A3，即使该笔 movement 实际上是由 A3S 建立的也一样。

## 核实说明
与 CLAUDE.md 自身关于同一解析器中另一处 derivesMovementTypeFromTenor 分支所描述的"第一个匹配即胜出"的相同行为一致。已确认。

## 来源证据

实现代码：
- `src/app/transaction-builder/function-strategy.ts:226-248`

测试：
- `src/app/transaction-builder/function-strategy.spec.ts:158-160`

## 相关知识
- [[Maker Checker Lifecycle]]
- movementTypeMatchesFunction / resolveFunctionForMovement Strategy 查找
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
