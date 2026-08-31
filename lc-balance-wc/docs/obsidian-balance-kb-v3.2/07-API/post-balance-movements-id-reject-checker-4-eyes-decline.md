---
knowledge_id: post-balance-movements-id-reject-checker-4-eyes-decline
title: "POST /balance-movements/:id/reject——Checker 四眼原则驳回"
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

# POST /balance-movements/:id/reject——Checker 四眼原则驳回

要求提供 releasedBy 和 reasonCode（两者缺一或全部缺失 -> 400 REQUEST_VALIDATION_FAILED）；只能对处于 PENDING 状态的记录执行（对已 RELEASED 的 Movement 执行驳回 -> 409 ILLEGAL_STATE_TRANSITION）。成功后将状态设为 REJECTED，持久化 releasedBy/reasonCode/remarks，且该 Movement 此后永远不会计入 Confirmed/Available Balance——这一点已通过驳回后立即拍摄的一份不受影响的余额快照得到验证。

## Source Evidence

- `test/unit/app.test.ts:1924-2035`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
