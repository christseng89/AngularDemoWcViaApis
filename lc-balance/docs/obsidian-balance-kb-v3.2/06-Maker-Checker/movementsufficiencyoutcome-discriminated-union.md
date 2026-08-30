---
knowledge_id: movementsufficiencyoutcome-discriminated-union
title: "MovementSufficiencyOutcome 可辨识联合类型"
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

# MovementSufficiencyOutcome 可辨识联合类型

type MovementSufficiencyOutcome = { ok: true; warning?: MovementWarning } | { ok: false; error: string }。这是 2026-08-20 应审阅者要求，由原来的 { ok: boolean; error?: string } 改造而成，移除了 error 字段上的非空断言（non-null assertion）。`warnings` 字段在技术上仍会被贯穿传递并写入持久化的 BalanceMovement 记录，但根据该文件自身的文档注释，目前所有 checkSufficiency 的具体实现都并未真正填充 `warning`——该字段类型定义"活着"，但实际上目前始终为 null。

## Source Evidence

- `balanceService.ts:1040-1041`
- `balanceService.ts:76-79`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
