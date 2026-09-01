---
knowledge_id: deletemakerpending-maker-ec-cancels-linked-legs-in-reverse-creation-or
title: 'deleteMakerPending()（Maker EC）按创建顺序的逆序取消关联 leg'
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

# deleteMakerPending()（Maker EC）按创建顺序的逆序取消关联 leg

Maker 撤回仍为 PENDING 的项目时，compound function 会按策略处理其关联 legs；A3S 与 B4 的 sibling movement 不得遗留。B5 是 plain 单一 settlement，因此 Delete Pending 只取消所选 B5 movement，不处理 Reimbursement Receivable。发起 API 前仍要求 `createdBy` 非空。

## Source Evidence

- `checker-actions.service.spec.ts:439-464`
- `checker-actions.service.ts:161-223`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
