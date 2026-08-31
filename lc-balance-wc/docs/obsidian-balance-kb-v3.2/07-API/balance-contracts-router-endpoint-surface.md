---
knowledge_id: balance-contracts-router-endpoint-surface
title: "Balance Contracts Router 端点介面"
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

# Balance Contracts Router 端点介面

routes/balanceContracts.ts 注册了 5 个 GET 端点：GET /balance-contracts（按 instrumentType+naturalKey 解析，可选启用 includeAnyStatus）、GET /balance-contracts/catalog（分页搜索，可选启用 requireIssueReleased/tenorFamily）、GET /balance-contracts/close-eligible（A10/B6 第一步选择器提示，由于资格判定横跨多张表，因此拥有自己独立的路由而非作为 catalog 的一个过滤旗标）、GET /balance-contracts/:id/balance（实时快照）、GET /balance-contracts/:id/movements（事件时间线）。路由层仅校验 instrumentType/lcNumber 是否存在，其余全部委派给 BalanceService。

## Source Evidence

- `src/routes/balanceContracts.ts:1-89`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
