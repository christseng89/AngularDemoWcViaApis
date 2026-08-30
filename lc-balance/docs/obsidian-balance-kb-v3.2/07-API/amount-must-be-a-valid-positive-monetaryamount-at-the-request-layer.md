---
knowledge_id: amount-must-be-a-valid-positive-monetaryamount-at-the-request-layer
title: "请求层要求 amount 必须是合法且为正的 MonetaryAmount"
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

# 请求层要求 amount 必须是合法且为正的 MonetaryAmount

POST /balance-movements 会拒绝（返回 400 REQUEST_VALIDATION_FAILED）以下两种 amount：(a) 不符合 MonetaryAmount 格式规则的值（例如 'not-a-number'）；(b) 恰好为 '0' 或负数——这两项校验均由 zod schema 在请求到达 service/domain 层之前就完成拦截，补上了这些值此前会被静默接受的漏洞。这一校验与 AMEND movementType 自身"符号即代表方向"的例外规则（详见变更记录）不同，且在处理顺序上位于其之前；该例外属于服务端逻辑，本次分析所读的路由测试中并未直接验证到。

## Source Evidence

- `test/unit/app.test.ts:1800-1815`
- `test/unit/app.test.ts:2416-2444`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
