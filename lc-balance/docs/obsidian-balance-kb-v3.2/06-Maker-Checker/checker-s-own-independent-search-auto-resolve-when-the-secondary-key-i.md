---
knowledge_id: checker-s-own-independent-search-auto-resolve-when-the-secondary-key-i
title: "次要键未知时，Checker 自身独立搜索的自动解析"
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

# 次要键未知时，Checker 自身独立搜索的自动解析

当已输入 LC Number，但该功能所需的次要键（IB/SG Number）留空时，searchCheckerLc() 不再直接硬报错——而是委托给 searchCheckerCandidatesByLcOnly()，后者会通过 catalog() 浏览该 LC 下、属于该功能自身 instrumentType 的所有 ACTIVE 候选记录（精确匹配 lcNumber，与 Maker 自身选取器所用的约定一致）。零个候选记录才是真正的错误；恰好一个则自动解析（设置 checkerAutoPickedHint）并直接加载其队列；多于一个则展示一个供人工挑选的列表（checkerSecondaryCandidates），因为此时究竟指的是哪条记录确实存在歧义。

## 2026-08-26 更新 —— 候选记录现已额外要求「存在可操作项」，不再只看 ACTIVE 状态

上文「通过 catalog() 浏览该 LC 下、属于该功能自身 instrumentType 的所有 ACTIVE 候选记录」一句，描述的是 2026-08-22 快照时点的行为，现已过时（并非本条目编造，而是源代码本身在此之后被修改）。业务于 2026-08-24 报告了一个真实缺口（"B3/A3/A3S 單獨使用 Checker，已經 earmarked 的交易不應該再被選出"）：`ACTIVE` 只是合约层级的状态，一个候选合约即便自身仍是 `ACTIVE`，其名下的动帳也完全可能已经被 Checker Release 过（即已 earmarked，对本次 Checker 操作而言已无事可做）——旧版 `searchCheckerCandidatesByLcOnly()` 只检查了 `catalog()` 返回的 `status: 'ACTIVE'`，从未检查过动帳本身的状态，因此这类候选仍会被列入待选清单，选中后进入 Checker Queue 才发现空空如也，构成一个死路。

现已修正：`searchCheckerCandidatesByLcOnly()` 对 `catalog()` 返回的每一个 ACTIVE 候选，额外呼叫 `listMovements()` 取得其名下全部动帳，再套用与 `loadCheckerQueue()` 完全相同的 `isCheckerActionable(movement, selectedFunction)` 判断式（EARMARKING/EARMARKED 判断逻辑的抽取共享，详见 [[earmarking-vs-earmarked-checker-queue-filter-split]] 的 2026-08-26 更新），只保留至少有一笔真正可操作动帳的候选。某个候选的 `listMovements()` 调用失败时，视为「该候选不可操作」而非让整个搜索失败（对应 `catchError(() => of(null))`）。零个候选、恰好一个自动解析、多于一个手动挑选的三分支决策形状本身未变，只是「候选」的定义从「合约 ACTIVE」收紧为「合约 ACTIVE 且至少有一笔 isCheckerActionable 动帳」。详见新规则 [[MAKER-CHECKER-RULE-062]]。

**验证**：已直接阅读 `checker-panel.component.ts` 第 145-147、193-260、328-336 行（`searchCheckerLc()` 自身文档注释更新、`searchCheckerCandidatesByLcOnly()` 的 `forkJoin`+`listMovements`+`isCheckerActionable` 组合、`isCheckerActionable()` 本身），以及 `checker-panel.component.spec.ts` 第 422-467 行（"a candidate with nothing actionable (already earmarked/RELEASED) is excluded" 与 "every candidate already earmarked/RELEASED" 两个专项测试）。

## Source Evidence

- `checker-panel.component.spec.ts:351-426`
- `checker-panel.component.ts:139-230`
- `checker-panel.component.ts:209-260,328-336`（2026-08-26 更新：`searchCheckerCandidatesByLcOnly()` 与 `isCheckerActionable()` 现行版本）
- `checker-panel.component.spec.ts:422-467`（2026-08-26 更新：已 earmarked 候选被排除的专项测试）

## Related Knowledge

- [[MAKER-CHECKER-RULE-062]] —— 2026-08-26 新增：本条目所述行为的收紧规则
- [[earmarking-vs-earmarked-checker-queue-filter-split]]
- [[Business-Rule-Index]]
- [[Balance Component Overview]]
