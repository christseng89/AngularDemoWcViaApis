---
knowledge_id: requireissuereleased-opt-in-catalog-filter
title: "requireIssueReleased 选择性开启的目录过滤条件"
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

# requireIssueReleased 选择性开启的目录过滤条件

GET /balance-contracts/catalog?requireIssueReleased=true 会排除任何自身 ISSUE Movement 仍处于 PENDING 状态的合约；不带该参数的相同查询仍会返回该合约。这是纯粹选择性开启（opt-in）的行为——所有省略该参数的既有调用方都不受影响。一旦该 ISSUE 被放行，该合约在带上此参数的查询中也同样会出现。

## Source Evidence

- `test/unit/app.test.ts:2278-2314`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
