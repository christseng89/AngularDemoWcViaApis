---
knowledge_id: checkerpanelcomponent-checker-independent-search-pending-movement-queu
title: "CheckerPanelComponent——Checker 独立搜索 + PENDING movement 队列"
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

# CheckerPanelComponent——Checker 独立搜索 + PENDING movement 队列

独立的 Angular 组件（`checker-panel.component.ts`），拥有 Checker 自己的 LC/次要键搜索框及由此产生的 PENDING movement 选取器。该组件刻意不拥有 Release/Reject/Approve 操作按钮及其忙碌/错误/组合路由状态——这些依旧由父组件 TransactionBuilderComponent 持有，并通过 CheckerActionContext/CheckerActionOutcome 与之互通。输入（Inputs）：selectedFunction、syncSignal（CheckerSyncSignal，按引用触发）、resetTrigger（计数器）、queueRefreshTrigger（计数器）。输出（Outputs）：movementPicked、queueReloaded、queueLoadSucceeded。

## Source Evidence

- `checker-panel.component.ts:20-99 (interface/@Input/@Output declarations + doc comments)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
