---
knowledge_id: present-docs-earmark-pending-approved-bucket-transition-on-release
title: "放行时 Present Docs Earmark 的 Pending/Approved 分桶迁移"
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

# 放行时 Present Docs Earmark 的 Pending/Approved 分桶迁移

放行一笔 PENDING 状态的 EPLC_EXAMINATION，会把其金额从父级 Confirmation 快照中的 presentDocsEarmarkPending 迁移到 presentDocsEarmarkApproved；该 Movement 自身的状态则真正变为 RELEASED。tightAvailableBalance 是 Pending 与 Approved 两者合计后净额，因此单纯的分桶迁移不会改变它——它仍旧占用相同的额度，直到之后被 B4 消费为止。

## Source Evidence

- `test/unit/app.test.ts:1599-1618`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
