---
knowledge_id: per-function-checker-queue-scoping-via-movementtypematchesfunction
title: "通过 movementTypeMatchesFunction 实现的按功能划分 Checker Queue 范围"
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

# 通过 movementTypeMatchesFunction 实现的按功能划分 Checker Queue 范围

由于多个 instrumentType 会被不止一个功能共用（例如 IPLC_LC 同时被 A1/A2/A3/A3S/A4 使用），loadCheckerQueue() 还会用 movementTypeMatchesFunction(selectedFunction, m.movementType)（来自 function-strategy.ts）对每一个候选记录再做一次过滤，从而确保例如 A2 自己的 Checker Queue 永远不会显示同一张 LC 下、与自己无关但恰好处于 PENDING 的 A3 UTILIZE 记录——每个功能的 Checker Queue，其范围都被限定为只能是该功能自身可能产生的变动记录。

## Source Evidence

- `checker-panel.component.spec.ts:599-619`
- `checker-panel.component.ts:256-262,281`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
