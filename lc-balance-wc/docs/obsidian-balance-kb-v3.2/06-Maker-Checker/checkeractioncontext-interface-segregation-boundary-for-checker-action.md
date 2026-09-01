---
knowledge_id: checkeractioncontext-interface-segregation-boundary-for-checker-action
title: 'CheckerActionContext——Checker 动作的接口隔离（Interface Segregation）边界'
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: 'N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]'
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# CheckerActionContext——Checker 动作的接口隔离（Interface Segregation）边界

这是 `CheckerActionsService` 的输入边界：包含 `submitResult`、`selectedFunction`、A3S/B4 所需的关联 leg ids、`createdBy` 与由 Checker 搜索取得的 `selectedCheckerMovement`。独立 Checker 以服务端 movement 为权威；B5 不再携带 matched Receivable id，直接处理所选 settlement。

## Source Evidence

- `checker-actions.service.ts:16-32`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
