---
knowledge_id: MOVEMENT-RULE-015
title: "请求层对币种精度（小数位数）的强制校验"
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

# MOVEMENT-RULE-015 — 请求层对币种精度（小数位数）的强制校验

## Status
CONFIRMED

## Business Rule
POST /balance-movements 会拒绝小数位数超过所提交币种所配置最小货币单位精度的金额（JPY 为 0 位小数，KWD 为 3 位小数，无法识别的币种默认按 2 位小数处理）。

## Conditions
amount 中的小数位数 > CURRENCY_MINOR_UNITS[currency]（无法识别的币种则为 2）

## Result
返回 400 REQUEST_VALIDATION_FAILED，错误信息中同时说明实际小数位数与允许的小数位数

## Example
JPY 金额 '10000.50' -> 400；JPY '10000' -> 201

## Verification Note
本轮未直接重新核对源码，但与 CLAUDE.md 中记录的决策日志条目——『金额输入遵循所选 Currency 自身的小数位数』（CURRENCY_MINOR_UNITS 在服务端有对应实现，并接入 POST /balance-movements）在机制上是一致的，可作为独立佐证；除此之外仅有测试证据。鉴于该佐证，仍保持 CONFIRMED。

## Source Evidence

实现:

测试:
- `test/unit/app.test.ts:1817-1885`

## Related Knowledge
- [[BalanceMovement]]
- 请求层对币种小数位数（最小货币单位）的强制校验
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
