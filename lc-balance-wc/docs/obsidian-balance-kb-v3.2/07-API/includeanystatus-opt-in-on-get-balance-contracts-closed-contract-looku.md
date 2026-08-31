---
knowledge_id: includeanystatus-opt-in-on-get-balance-contracts-closed-contract-looku
title: "includeAnyStatus 可选启用于 GET /balance-contracts（用于查询 CLOSED 合约）"
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

# includeAnyStatus 可选启用于 GET /balance-contracts（用于查询 CLOSED 合约）

GET /balance-contracts 默认只解析 ACTIVE 状态的合约——一笔已 CLOSED 的合约（经 A10/B6 关闭后）按自然键查询会返回 404。传入 includeAnyStatus=true 可以让同一个查询不论状态都能解析出结果；所有会创建交易的调用方都必须持续不传该旗标，以确保一笔已关闭的 LC 无法再被选中用于后续交易，而"查询当前余额"（仅限查询、不创建交易）功能则会使用该旗标，以便仍能显示它。

## Source Evidence

- `src/routes/balanceContracts.ts:9-31`
- `test/unit/app.test.ts:2372-2414`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
