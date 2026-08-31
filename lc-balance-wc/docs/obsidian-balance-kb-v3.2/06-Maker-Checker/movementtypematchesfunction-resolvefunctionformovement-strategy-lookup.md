---
knowledge_id: movementtypematchesfunction-resolvefunctionformovement-strategy-lookup
title: "movementTypeMatchesFunction / resolveFunctionForMovement 策略查找"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 本次分析快照中无 .git 历史记录，详见 [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# movementTypeMatchesFunction / resolveFunctionForMovement 策略查找

将 IMPORT_FUNCTIONS/EXPORT_FUNCTIONS 当作一张策略表来处理，而不是再建一张 (instrumentType, movementType) -> function 的映射表。多数功能只需按字面 movementType 或 subChoice 选项即可匹配；但有 3 个功能（B4、A9、B5）因其注册表条目仅带有占位默认值，需要额外走一条派生 movementType 的分支来处理。该逻辑被复用在两处：一是用于过滤各功能自身的 Checker Queue（例如让 A2 永远不会显示与自己无关的 A3 UTILIZE 记录），二是用于解析某一历史 Inquire Events 行应重建为哪个功能的字段集合。

## Source Evidence

- `src/app/transaction-builder/function-strategy.spec.ts lines 113-174`
- `src/app/transaction-builder/function-strategy.ts lines 185-248`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
