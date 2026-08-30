---
knowledge_id: inquireeventscomponent-view-layer-extraction
title: "InquireEventsComponent（视图层抽离）"
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

# InquireEventsComponent（视图层抽离）

一个独立组件（standalone component），职责纯粹是 Inquire Events 的视图层——所有编排逻辑与状态都保留在由父组件拥有并构造的 InquireEventsService 中，以一个普通的 @Input() 传入。Account Entries 对话框请求通过一个 (openAccountEntries) EventEmitter 向上冒泡，携带 {movement, instrumentType, phase}，而不是由本组件自行管理对话框状态，因为该对话框同时也会从 Maker Result 面板与 Look Up 面板自身的 Event Timeline 中被打开。

## Source Evidence

- `inquire-events.component.ts`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
