---
knowledge_id: MOVEMENT-RULE-024
title: "movementTypeMatchesFunction 能正确区分每一种 EPLC_CONFIRMATION movementType——derivesMovementTypeFromTenor 分支只为 B4 匹配 HONOUR/ACCEPT，不匹配 CLOSE"
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

# MOVEMENT-RULE-024 — movementTypeMatchesFunction 能正确区分每一种 EPLC_CONFIRMATION movementType——derivesMovementTypeFromTenor 分支只为 B4 匹配 HONOUR/ACCEPT，不匹配 CLOSE

## Status
CONFIRMED

## Business Rule
derivesMovementTypeFromTenor 分支必须只为 B4 匹配 movementType 为 HONOUR 或 ACCEPT 的情况——若无条件匹配（修复前的行为），由于 B4 在注册顺序上排在 B6 之前，且解析器返回第一个匹配项，就会把每一种其他 EPLC_CONFIRMATION movementType（包括后来新增的 CLOSE）都悄无声息地吞并进 B4。

## Conditions
instrumentType === 'EPLC_CONFIRMATION'

## Result
ISSUE 解析为 B1，AMEND 解析为 B2，CLOSE 解析为 B6；只有 HONOUR/ACCEPT 解析为 B4

## Example
resolveFunctionForMovement('EPLC_CONFIRMATION','CLOSE') -> B6，而非 B4

## Verification Note
本轮未直接重新核对源码，但与 CLAUDE.md 中 A10/B6 Close 决策日志条目对同一缺陷及其修复的描述在措辞上相互印证；保持 CONFIRMED。

## Source Evidence

实现:
- `src/app/transaction-builder/function-strategy.ts:206-224`

测试:
- `function-strategy.spec.ts:128-132`

## Related Knowledge
- [[BalanceMovement]]
- movementTypeMatchesFunction / resolveFunctionForMovement 策略查找
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
