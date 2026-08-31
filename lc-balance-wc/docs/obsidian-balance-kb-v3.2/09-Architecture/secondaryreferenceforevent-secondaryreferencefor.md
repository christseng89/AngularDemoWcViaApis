---
knowledge_id: secondaryreferenceforevent-secondaryreferencefor
title: "secondaryReferenceForEvent() / secondaryReferenceFor()"
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

# secondaryReferenceForEvent() / secondaryReferenceFor()

模块级函数，用于从一个 InquiredEvent 的合约 naturalKey 中推导出“次要参考号（Secondary Ref.）”栏位的值：EPLC_EXAMINATION（B3）显示裸的 EB/IB Number（event.contract.naturalKey.ibNumber，若不存在则显示“—”）；SHGT 显示“SG {sgNumber}”（若不存在则显示“—”）；其他所有 instrumentType 一律显示“—”。InquireEventsService 与 LookUpPanelService 各自的 secondaryReferenceFor() 包装函数完全共用同一实现，因此 Look Up Current Balance 的 Event Timeline 与 Inquire Events 的合并表格在这一映射上永远不会出现不一致。

## Source Evidence

- `inquire-events.service.ts:76-80 secondaryReferenceForEvent()`
- `look-up-panel.service.ts:116-119 secondaryReferenceFor()`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
