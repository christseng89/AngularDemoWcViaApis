---
knowledge_id: rate-limiting-scoped-to-the-write-surface-only
title: "限流仅作用于写入面"
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

# 限流仅作用于写入面

express-rate-limit 仅应用于 /balance-movements 路径（60 秒窗口内 120 次请求，启用 standardHeaders），在 app.ts 中注册于 balanceContractsRouter 之后、balanceMovementsRouter 之前。读多写少的 /balance-contracts 目录/查找/快照类端点（供选取器与 Business Case Runner 回放流程使用）被特意排除在限流之外——这是针对 Maker/Checker 写入路径的基础防滥用手段，而不是对正常使用的吞吐量上限。

## Source Evidence

- `src/app.ts:17-24`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
