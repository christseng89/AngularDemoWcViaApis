---
knowledge_id: MOVEMENT-RULE-016
title: "请求层要求金额必须是合法且严格为正的 MonetaryAmount"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - movement
  - confirmed
---

# MOVEMENT-RULE-016 — 请求层要求金额必须是合法且严格为正的 MonetaryAmount

## Status
CONFIRMED

## Business Rule
POST /balance-movements 会在请求到达领域逻辑之前，拒绝不符合 MonetaryAmount 格式，或数值恰好为 0 或为负数的金额。

## Conditions
amount 无法按 MonetaryAmount 解析，或其数值 <= 0

## Result
返回 400 REQUEST_VALIDATION_FAILED

## Example
amount 为 'not-a-number' -> 400；amount 为 '0' -> 400；amount 为 '-5000' -> 400

## Verification Note
本轮未直接重新核对源码，但与本轮其他地方已独立确认的 parseMonetaryAmount()/assertValidAmount() 行为（money.ts 中 MONETARY_AMOUNT_PATTERN 的不变式、BAL-115 条目）直接一致。路由层 400 仅有测试证据引用；鉴于有以上佐证，仍保持 CONFIRMED。

## Source Evidence

实现:

测试:
- `test/unit/app.test.ts:1800-1815`
- `test/unit/app.test.ts:2416-2444`

## Related Knowledge
- [[BalanceMovement]]
- 请求层要求金额必须是合法且为正的 MonetaryAmount
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
