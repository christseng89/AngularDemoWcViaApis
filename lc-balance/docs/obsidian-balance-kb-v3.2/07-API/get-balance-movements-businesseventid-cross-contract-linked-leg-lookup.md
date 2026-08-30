---
knowledge_id: get-balance-movements-businesseventid-cross-contract-linked-leg-lookup
title: "GET /balance-movements?businessEventId= 跨合约的关联分腿（linked leg）查询"
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

# GET /balance-movements?businessEventId= 跨合约的关联分腿（linked leg）查询

要求 businessEventId 作为查询参数（缺失时返回 400 REQUEST_VALIDATION_FAILED）。返回所有共享该 businessEventId 的 movement，可能横跨不同的合约（例如某 LC 的 UTILIZE 与其匹配的 SHGT FULL_REDEEM），按时间从旧到新排序；若没有任何 movement 携带该 businessEventId，则返回空数组（而非 404）。设立该端点的目的，正是为了让一个真正独立的 Checker 浏览器会话，能够在不依赖 Maker 自身内存态的情况下，解析出一次复合提交所关联的分腿。

## Source Evidence

- `test/unit/app.test.ts:3150-3225`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
