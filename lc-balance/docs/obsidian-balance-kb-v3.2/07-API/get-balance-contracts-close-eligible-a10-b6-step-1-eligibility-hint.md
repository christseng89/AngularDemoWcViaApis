---
knowledge_id: get-balance-contracts-close-eligible-a10-b6-step-1-eligibility-hint
title: "GET /balance-contracts/close-eligible — A10/B6 第一步的可关闭资格提示"
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

# GET /balance-contracts/close-eligible — A10/B6 第一步的可关闭资格提示

仅返回当前符合关闭（Close）资格的 ACTIVE 根合约（限所请求的 instrumentType）：SG Confirmed Balance = 0，Acceptance Confirmed Balance = 0，且整棵树中不存在任何未结事件（PENDING，或对 EPLC_CONFIRMATION 而言，尚未 presentDocsConsumedAt 的已 RELEASED Examination），且尚未处于 Closed 状态。只要候选合约存在非零的已 RELEASED SG 余额，或存在任意 PENDING 的同级事件（自身的 AMEND_DECREASE、SG ISSUE，或 Acceptance CREATE），即使其整体状态仍为 ACTIVE，也会被排除在外。支持按 lcNumber 精确匹配过滤，并在已过滤出的合格集合上支持 page/pageSize 分页。instrumentType 为必填项（否则返回 400）。

## Source Evidence

- `src/routes/balanceContracts.ts:60-76`
- `test/unit/app.test.ts:2316-2370`
- `test/unit/service/closeEligibleContractsBatch.test.ts:149-199`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
