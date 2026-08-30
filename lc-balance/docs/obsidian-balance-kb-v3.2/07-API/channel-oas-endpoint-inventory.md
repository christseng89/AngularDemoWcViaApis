---
knowledge_id: channel-oas-endpoint-inventory
title: "Channel OAS 端点清单"
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

# Channel OAS 端点清单

balance-component-channel-api.yaml（v1.2.0）定义了：GET /channel/functions（功能目录）、GET /channel/contracts/lookup、GET /channel/contracts/catalog、GET /channel/contracts/{id}/balance、GET /channel/contracts/{id}/movements、POST /channel/transactions（oneOf ChannelOriginTransactionRequest | ChannelDerivedTransactionRequest）、GET/POST /channel/transactions/{id}、.../release、.../reject、.../cancel，以及 GET /channel/checker/queue。/channel/transactions/{id}/acknowledge 已在 v1.2.0 中被移除（B3 现在改用标准放行路径）。

## Source Evidence

- `balance-component-channel-api.yaml lines 102-116 (v1.2.0 changelog)`
- `balance-component-channel-api.yaml lines 131-563 (paths block)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
