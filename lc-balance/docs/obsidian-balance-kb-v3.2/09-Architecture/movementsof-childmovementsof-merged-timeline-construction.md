---
knowledge_id: movementsof-childmovementsof-merged-timeline-construction
title: "movementsOf$() / childMovementsOf$()——合并时间线的构建"
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

# movementsOf$() / childMovementsOf$()——合并时间线的构建

movementsOf$() 通过 toEventRows() 将一个合约自身的动账压平为 InquiredEvent[]，并将任何 listMovements() 的错误吞噬为空数组（不会对更大范围的合并造成致命影响）。childMovementsOf$() 会针对匹配某个 LC Number 的给定子 instrumentType 下的每一份合约展开（透过 catalog()，上限为 50 份），将每份合约各自的 movementsOf$() 结果压平，同样也会将 catalog() 的错误吞噬为 []。这两者是 InquireEventsService.loadEvents()/loadIndex() 与 LookUpPanelService 自身的分页加载（loadSnapshotAndMovements 的 mergeChildTypes）共同依赖的基础函数。

## Source Evidence

- `inquire-events.service.spec.ts:240-270 (error-swallowing tests)`
- `inquire-events.service.ts:98-118`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
