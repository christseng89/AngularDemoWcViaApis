---
knowledge_id: functionstrategy-registry-function-strategy-ts
title: "FunctionStrategy 注册表（function-strategy.ts）"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 本次分析快照中无 .git 历史记录，详见 [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-30
tags:
  - balance
  - domain-concept
---

# FunctionStrategy 注册表（function-strategy.ts）

这是一份手工编写、按功能代码（function code）逐一定义的注册表（FUNCTION_STRATEGY_DEFINITIONS -> FUNCTION_STRATEGIES），取代了原本直接挂在 TransactionFunction 上的 11 个布尔标志位。按 4 个不同消费方分组为 4 个接口：MovementDerivationStrategy（submit-rules.ts）、CompoundSubmissionStrategy（maker-submit.service.ts）、CheckerReleaseStrategy（checker-actions.service.ts）、SelectionFlowStrategy（第二步选择器）。deriveFunctionStrategy() 每次调用都会返回一个全新的、彼此独立的对象（而非共享的字面量引用），避免调用方不小心改动到共享状态。

## Source Evidence

- `src/app/transaction-builder/function-strategy.spec.ts lines 8-110 (PR-2 equivalence-proof describe block)`
- `src/app/transaction-builder/function-strategy.ts lines 60-183 (FunctionStrategy interface, FUNCTION_STRATEGY_DEFINITIONS, deriveFunctionStrategy, FUNCTION_STRATEGIES)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
- [[Transaction Index Selection Contract]]
- [[BalanceService Facade Architecture]]
