---
knowledge_id: MOVEMENT-RULE-019
title: "B4 的 movementType 由该 Confirmation 自身的 tenorType 推导而来，绝不由用户挑选"
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

# MOVEMENT-RULE-019 — B4 的 movementType 由该 Confirmation 自身的 tenorType 推导而来，绝不由用户挑选

## Status
CONFIRMED

## Business Rule
B4（Honour/Acceptance，承付/承兑）是唯一一个真实 movementType（HONOUR 还是 ACCEPT）在提交时从所选 Confirmation 合同的 tenorType 中读取，而不是在注册表中固定、也不是通过 subChoice 选择的功能。

## Conditions
selectedFunction.code === 'B4'

## Result
movementTypeMatchesFunction() 会把 HONOUR 与 ACCEPT 都视为 B4 可能产生的结果；resolveFunctionForMovement() 会把两者都解析回 B4

## Example
resolveFunctionForMovement('EPLC_CONFIRMATION','HONOUR') -> B4；resolveFunctionForMovement('EPLC_CONFIRMATION','ACCEPT') -> B4

## Verification Note
本轮未直接重新核对源码，但与本轮下方已独立验证的 movementTypeMatchesFunction()/resolveFunctionForMovement() 修复（CLOSE 与 HONOUR/ACCEPT 的区分）以及 CLAUDE.md 中的 B4 决策日志条目在内部逻辑上一致；保持 CONFIRMED。

## Source Evidence

实现:
- `src/app/transaction-builder/function-strategy.ts:19-20,93-97,146,220`

测试:
- `function-strategy.spec.ts:42-45,123-126`

## Related Knowledge
- [[BalanceMovement]]
- FunctionStrategy 注册表（function-strategy.ts）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
