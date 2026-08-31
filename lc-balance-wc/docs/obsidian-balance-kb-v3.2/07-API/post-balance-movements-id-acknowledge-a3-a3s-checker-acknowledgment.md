---
knowledge_id: post-balance-movements-id-acknowledge-a3-a3s-checker-acknowledgment
title: "POST /balance-movements/:id/acknowledge——A3/A3S 的 Checker 确认收讫"
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

# POST /balance-movements/:id/acknowledge——A3/A3S 的 Checker 确认收讫

在一笔 IPLC_LC/UTILIZE Movement 上设置 acknowledgedBy/acknowledgedAt，且不触及其状态（仍保持 PENDING）——使得 Checker Queue 能够过滤掉已经确认过的 Document Arrival，避免重复展示。仅限于 IPLC_LC/UTILIZE（否则返回 400）；限单次使用，第二次调用会返回 409 ILLEGAL_STATE_TRANSITION（提示「已由 X 确认」）；acknowledgedBy 为必填（缺失则 400）。历史上该路由/方法也曾服务于 B3，但 B3 已于 2026-08-18 重新设计为改用标准的 release() 路径，因此该路由现在完全只属于 A3/A3S。

## Source Evidence

- `test/unit/app.test.ts:2614-2729`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
