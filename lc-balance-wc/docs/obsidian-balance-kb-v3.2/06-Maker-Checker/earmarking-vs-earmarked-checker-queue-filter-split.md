---
knowledge_id: earmarking-vs-earmarked-checker-queue-filter-split
title: "EARMARKING 与 EARMARKED 的 Checker Queue 过滤分流"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# EARMARKING 与 EARMARKED 的 Checker Queue 过滤分流

loadCheckerQueue() 针对同一个"PENDING + acknowledgedAt"事实，对 A3/A3S 与 A4 分别施加两种方向相反、按功能限定范围的过滤。A3/A3S（deferSettlement）会排除已经 acknowledgedAt 的 UTILIZE——因为一旦其自身的 Checker 已经确认过，再在 A3/A3S 画面上重复展示就毫无意义了，该记录会留待 A4/A6 之后在各自画面上终结。A4（releasesExistingMovementInPlace）则恰恰相反：会排除仍处于 EARMARKING（尚无 acknowledgedAt）的 UTILIZE，因为在 A3 的 Checker 确认之前，A4 的 Checker 根本没有任何可以合法 Release 的对象——这正是真正的 4-eyes。除此之外的其余所有功能都不受此分流影响。

## 2026-08-26 更新 —— 过滤逻辑已抽取为共享的 isCheckerActionable()，供第二个调用方复用

上文所述的过滤逻辑，原本只内嵌于 `loadCheckerQueue()` 一处。业务于 2026-08-24 报告缺口后（"B3/A3/A3S 單獨使用 Checker，已經 earmarked 的交易不應該再被選出"），该逻辑已被抽取为独立的私有方法 `isCheckerActionable(movement, selectedFunction)`——`loadCheckerQueue()` 自身的过滤行为完全不变（只是改成调用这个抽取出的方法），但同一判断式现在也被 `searchCheckerCandidatesByLcOnly()`（LC Number 已输入、次要键留空时的候选搜索——见 [[checker-s-own-independent-search-auto-resolve-when-the-secondary-key-i]]）复用：该方法对每个候选记录额外 `listMovements()` 并套用同一 `isCheckerActionable()`，只保留至少有一笔可操作项的候选，从而使候选列表与其之后加载的 Checker Queue 对"何为可操作"的判断永远一致，不会再出现候选可选、选中后队列却空空如也的情形。详见新规则 [[MAKER-CHECKER-RULE-062]]。

**验证**：已直接阅读 `checker-panel.component.ts` 第 265-296 行（`loadCheckerQueue()` 现行版本，调用抽取后的 `isCheckerActionable()`）与第 328-336 行（`isCheckerActionable()` 本身，EARMARKING/EARMARKED 判断逻辑与本条目原文描述完全一致，未发生行为变化）。

## Source Evidence

- `checker-panel.component.spec.ts:496-597 (5 tests covering both directions)`
- `checker-panel.component.ts:232-264,279-285`（原始位置，供历史行号对照）
- `checker-panel.component.ts:265-296,328-336`（2026-08-26 更新：抽取后的 `loadCheckerQueue()`/`isCheckerActionable()` 现行行号）

## Related Knowledge

- [[MAKER-CHECKER-RULE-062]] —— 2026-08-26 新增：`isCheckerActionable()` 抽取共享后的收紧规则
- [[checker-s-own-independent-search-auto-resolve-when-the-secondary-key-i]]
- [[Business-Rule-Index]]
- [[Balance Component Overview]]
