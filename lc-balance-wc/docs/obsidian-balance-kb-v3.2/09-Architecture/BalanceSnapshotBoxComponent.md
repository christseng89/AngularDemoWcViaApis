---
knowledge_id: balancesnapshotboxcomponent
title: "BalanceSnapshotBoxComponent"
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

# BalanceSnapshotBoxComponent

独立的、由 @Input() 驱动的组件（title/status/snapshot/impact），取代了原先的 #balanceSnapshotBox ng-template——一旦 Inquire Events 独立成为自己的子组件，该模板便无法再跨越组件边界使用。Look Up 面板（impact 始终为 null，即普通、不带标注的 Confirmed Balance）与 InquireEventsComponent（impact 有值）以完全相同的方式使用它。渲染内容包括币种（Currency）、Confirmed Balance（当 impact 有值且未被重定向时显示 before→after；当 impact.after 为 null/undefined 时显示“仍为 PENDING”提示）、可用余额（Available Balance）、待处理担保总额（Pending Earmark Total）、表外风险敞口（Off-Balance Exposure）、Present Docs Earmark（Pending）/（Approved），以及紧缩可用余额（Tight Available Balance）（以上最后 3 项均按是否为 null 条件性渲染，且每一项均可透过 snapshot.redirectedImpact 单独重定向）。

## 证据来源

- `balance-snapshot-box.component.html`
- `balance-snapshot-box.component.ts`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
