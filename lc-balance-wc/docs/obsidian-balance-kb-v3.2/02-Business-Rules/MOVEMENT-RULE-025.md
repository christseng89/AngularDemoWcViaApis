---
knowledge_id: MOVEMENT-RULE-025
title: "提交时的通用『金额 > 0』校验，CLOSE 是唯一豁免的情况"
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

# MOVEMENT-RULE-025 — 提交时的通用『金额 > 0』校验，CLOSE 是唯一豁免的情况

## Status
CONFIRMED

## Business Rule
每种功能所输入的 Amount 都必须严格大于 0，该检查在 validateSubmit() 中较早的位置进行——唯一的例外是 movementType 为 CLOSE（A10/B6）的情况，此时 0 是一个合法的核销值，甚至负数金额也不会被这一特定的客户端校验捕获（此时改由更严格的服务端『必须与 Confirmed Balance 精确相等』的检查来处理，而服务端的 assertValidAmount() 确实会拒绝负数的 CLOSE 金额）。

## Conditions
model.movementType !== 'CLOSE'

## Result
Number(model.amount) <= 0 -> fail('Amount must be greater than 0.')；CLOSE 绕过这一特定校验

## Example
A1 amount='0' -> 被拒绝。A10 CLOSE amount='0' -> 通过这一客户端校验；A10 CLOSE amount='-1' -> 同样通过这一特定校验（而是被服务端的 assertValidAmount() 拒绝）

## Verification Note
已直接阅读 validateSubmit() 中的具体分支；与声明内容完全一致。

## Source Evidence

实现:
- `src/app/transaction-builder/submit-rules.ts:61-77`

测试:
- `submit-rules.spec.ts:556-606`

## Related Knowledge
- [[BalanceMovement]]
- 通用『金额 > 0』校验，CLOSE 豁免
- assertValidAmount() 服务端兜底校验
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
