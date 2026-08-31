---
knowledge_id: MAKER-CHECKER-RULE-028
title: "复核队列的 EARMARKING/EARMARKED 拆分——A3/A3S 排除已确认的候选项，A4 则要求候选项已同时确认并经经办人提交"
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

# MAKER-CHECKER-RULE-028 — 复核队列的 EARMARKING/EARMARKED 拆分——A3/A3S 排除已确认的候选项，A4 则要求候选项已同时确认并经经办人提交

## 状态
CONFIRMED

## 业务规则
loadCheckerQueue() 会对 PENDING 状态的 movement 进行筛选：对于 deferSettlement 类功能（A3/A3S），一旦其自身 deferSettlementMovementType（默认为 UTILIZE）的候选项已设定 acknowledgedAt，就会将其排除（这样一来，已获批准的到单已不会再出现在 A3/A3S 自身的队列中）。对于 releasesExistingMovementInPlace 类功能（A4），除非候选项同时设定了 acknowledgedAt 与 makerSubmittedAt，否则会排除 UTILIZE 候选项（A4 需要一笔真正已被 EARMARKED 且已经过经办人提交的记录，才会出现在其自身的复核人搜索结果中）。其余所有功能都不套用上述两项条件（仅以 status==='PENDING' 判断）。

## 条件
所选功能的 FunctionStrategy.checkerRelease.deferSettlement（A3/A3S）或 .releasesExistingMovementInPlace（A4）；候选项的 movementType；候选项的 acknowledgedAt；候选项的 makerSubmittedAt。

## 结果
候选项被纳入 checkerItems，或被筛除。

## 示例
A3 队列中，acknowledgedAt 为 null 的 UTILIZE -> 被纳入；同一笔 UTILIZE 一旦设定 acknowledgedAt -> 从 A3 自身队列中排除，但仍会显示给 A4（一旦 makerSubmittedAt 也被设定）。

## 验证说明
已由 CLAUDE.md 自身多条决策日志条目深入佐证，完整追溯了此筛选逻辑的演进过程（最初的 EARMARKED 要求、随后两次将排除范围限定于 deferSettlement 的修正、以及后续新增的 makerSubmittedAt 条件）。已确认。

## 来源证据

实现：
- `src/app/transaction-builder/checker-panel.component.ts:264-293`

测试：
- `src/app/transaction-builder/checker-panel.component.spec.ts:496-597`

## 相关知识
- [[Maker Checker Lifecycle]]
- EARMARKING 与 EARMARKED 两种复核队列筛选方式的拆分
- A4 自身的复核队列现在也要求经办人已提交，不仅仅是 EARMARKED
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
