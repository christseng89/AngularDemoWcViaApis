---
knowledge_id: MOVEMENT-RULE-053
title: "A10/B6 CLOSE 的金额必须与当前的 Confirmed Balance 完全相等，且在 Submit 与 Release 两个环节都要重新校验"
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

# MOVEMENT-RULE-053 — A10/B6 CLOSE 的金额必须与当前的 Confirmed Balance 完全相等，且在 Submit 与 Release 两个环节都要重新校验

## Status
CONFIRMED

## Business Rule
对于 CLOSE，amount 从不由 Maker 手工录入——而是在 Submit 时从 Confirmed Balance 自动带出并锁定（可以为 0，但绝不能为负数）；由于 Confirmed Balance/资格条件在 Submit 与 Release 之间可能发生变化，金额匹配校验与资格校验会在 Approve 时再次重新验证。

## Conditions
movementType === CLOSE

## Result
若余额在 Submit 与 Approve 之间发生变化，会强制要求重新提交，而不是静默地覆盖写入过大或过小的值

## Example
所审阅的源证据中没有可用的具体数值示例。

## Verification Note
本轮已完整阅读 balanceService.ts 中 closeShaped 的 movementTypeRegistry 条目并直接确认——与所声明的『与 confirmedBalance 完全相等校验』及『资格重新校验』相符。

## Source Evidence

Implementation:
- `microservices/balance-component/src/service/balanceService.ts:200-230 (closeShaped)`

Tests:
- （未引用直接测试证据）

## Related Knowledge
- [[BalanceMovement]]
- A10/B6 Close — Write-off and Contract Retirement
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
