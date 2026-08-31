---
knowledge_id: MAKER-CHECKER-RULE-041
title: "A4/A6 应付类 movement 的可用性要求真正的四眼原则（EARMARKED，而非仅 EARMARKING），并排除任何 A4 自身已提交过的记录"
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

# MAKER-CHECKER-RULE-041 — A4/A6 应付类 movement 的可用性要求真正的四眼原则（EARMARKED，而非仅 EARMARKING），并排除任何 A4 自身已提交过的记录

## 状态
CONFIRMED

## 业务规则
一笔到单（IPLC_LC/UTILIZE），只有在其自身的 A3/A3S 复核人真正予以确认之后，才会提供给 A4（合约内挑选器）或 A6（Parent LC 挑选器）——仅仅经办人已提交（EARMARKING，acknowledgedAt 仍为 null）是不够的。A4 自身的挑选器还会额外排除任何自己已经经办人提交过的候选项（makerSubmittedAt 已设定）——针对同一笔正在完成中的 movement，不会留下可重复经办人提交的对象。

## 条件
movementType === 目标类型（默认为 'UTILIZE'）且 status === 'PENDING'，并且（movementType !== 'UTILIZE' 或（acknowledgedAt 已设定 且 makerSubmittedAt 未设定——makerSubmittedAt 这项排除条件专属于 A4，对于从不设定该字段的 A6 而言不起作用））。

## 结果
候选项被纳入 payableMovements/可用性提示映射；否则会同时从第一步的 LC 层级提示与第二步的挑选器清单中被排除。

## 示例
一笔由 A3 经办人提交、但复核人尚未确认（acknowledgedAt 为 null）的 UTILIZE movement，不会出现在 A4 或 A6 的挑选器中；一旦确认，它就会出现，而当 A4 自身对它执行经办人提交之后（makerSubmittedAt 已设定），它又会立刻消失。

## 验证说明
已将 3 个高度相似的候选证据（Angular 端 picker-selection.service.ts 的实现、以及来自 Balance-Figures-Calculation-Logic.txt 中两份重述相同 EARMARKED 闸门与「排除 A4 自身已提交项」的设计文档描述）合并为一条，因为设计文档候选证据完全被代码层级候选证据自身的 businessRule 内容所涵盖。此外已由 CLAUDE.md 自身描述这项确切业务指示（“A4 選取 EARMARKED 的交易”）与实况中发现的两次后续缺陷的决策日志条目强力佐证。虽未针对 picker-selection.service.ts 本身给出直接测试引用，但多来源文档佐证加上直接阅读源码，已足以维持 CONFIRMED。

## 来源证据

实现：
- `src/app/transaction-builder/picker-selection.service.ts:329-346`
- `src/app/transaction-builder/document-arrival-hints.service.ts:52-88`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Maker Checker Lifecycle]]
- 复合式复核人放行/拒绝路由
- A4/A6 挑选器可用性现在要求真正的四眼原则：EARMARKED（复核人已确认），而非仅 EARMARKING
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
