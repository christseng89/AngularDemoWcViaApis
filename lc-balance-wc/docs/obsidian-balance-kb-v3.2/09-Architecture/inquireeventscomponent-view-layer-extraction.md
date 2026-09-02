---
knowledge_id: inquireeventscomponent-view-layer-extraction
title: "InquireEventsComponent（视图层抽离）"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-09-02
tags:
  - balance
  - domain-concept
---

# InquireEventsComponent（视图层抽离）

一个独立组件（standalone component），职责纯粹是 Inquire Events 的视图层——所有编排逻辑与状态都保留在由父组件拥有并构造的 InquireEventsService 中，以一个普通的 @Input() 传入。Account Entries 对话框请求通过一个 (openAccountEntries) EventEmitter 向上冒泡，携带 {movement, instrumentType, phase}，而不是由本组件自行管理对话框状态，因为该对话框同时也会从 Maker Result 面板与 Look Up 面板自身的 Event Timeline 中被打开。

2026-09-02：Events table 將目前選取列持續標示為 active，並設定 `aria-selected`。選取 identity 是 `movementId + phase`，不是 object reference 或 movementId 單值，因為 A4 可將同一 movement 投影為 create/finalize 兩個真實事件列。滑鼠、Enter、Space 使用同一 `selectEvent()`，被標示列因此與下方 Original Transaction Screen／Balance Detail 保持一對一。

## Source Evidence

- `inquire-events.component.ts`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
