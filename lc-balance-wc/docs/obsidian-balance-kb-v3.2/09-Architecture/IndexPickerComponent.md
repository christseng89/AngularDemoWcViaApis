---
knowledge_id: indexpickercomponent
title: "IndexPickerComponent"
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

# IndexPickerComponent

Transaction Builder 中每一个“从列表中选取”UI（LC Index、Parent LC、IB/SG Index、SG picker、PENDING Document Arrival picker、Look Up 自身的 Acceptance/SG picker）背后共用的同一个纯展示型 Angular 组件。不拥有任何搜索/分页/选取状态或业务逻辑——行内容完全由调用方通过 `ng-template` 内容投影控制。其 `itemId()` 辅助函数必须先检查 `movementId` 再检查 `balanceContractId`（曾有一个缺陷会把每一条 movement 行的 id 误解析为其所属合约的 id，因为一条 movement 自身也携带了其所属合约的 id 作为字段）。

## 证据来源

- `index-picker.component.ts:1-58`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
