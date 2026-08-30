---
knowledge_id: checker-action-routing-by-compound-submission-shape
title: "按组合提交（compound-submission）形态路由的 Checker 动作"
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

# 按组合提交（compound-submission）形态路由的 Checker 动作

CheckerActionsService.release() 根据所选功能的 FunctionStrategy 分支决定释放链：(1) settlesDocumentArrival（A6/B4）先释放一条源记录再释放主记录，其中 B4 自身的源记录（已被独立释放过）会被标记为"已消费（consumed）"，而不是再次释放；(2) documentArrivalWithSg（A3S）释放相匹配的 SG 赎回，随后确认（而非释放）源 UTILIZE；(3) amountVsAvailableDerivation === 'SETTLE'（B5）先释放主 Acceptance settle，再释放相匹配的 Reimbursement Receivable；(4) 其余所有功能都执行一次以 selectedCheckerMovement 为主键的普通单次释放，并以 submitResult 作为兜底。

## Source Evidence

- `checker-actions.service.spec.ts (all describe blocks)`
- `checker-actions.service.ts:49-128`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
