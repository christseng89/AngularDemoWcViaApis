---
knowledge_id: pickerselectionservice
title: "PickerSelectionService"
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

# PickerSelectionService

负责一旦 Step-1 完成 LC/Parent 选取之后的三套 Step-2“次级 Index”级联选择器子系统：A3S 自身的 SG picker、B5 自身的 EB Index，以及 A4/A6/B4 共用的应付 movement picker。返回纯粹的结果对象（`PayMovementSelectionOutcome`/`SettleableBalanceSelectionOutcome`）供调用方应用到自身组件状态，或接受一个显式的 `onUpdated` 回调，用于需要组件自身侧效应的异步链路——与 CheckerActionsService/MakerSubmitService 采用相同的依赖反转（Dependency-Inversion）模式。以组件为作用域提供（无 `providedIn`），因为状态是按实例各自持有的。

## 证据来源

- `picker-selection.service.ts:1-463`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
