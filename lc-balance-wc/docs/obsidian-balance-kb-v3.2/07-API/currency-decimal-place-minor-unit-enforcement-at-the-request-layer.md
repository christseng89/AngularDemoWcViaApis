---
knowledge_id: currency-decimal-place-minor-unit-enforcement-at-the-request-layer
title: "请求层的币别小数位（最小货币单位）校验"
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

# 请求层的币别小数位（最小货币单位）校验

POST /balance-movements 会在请求到达领域逻辑之前，先按每种币别预先配置好的精度，校验所提交 amount 的小数位数：JPY 允许 0 位小数，KWD 允许 3 位小数，任何无法识别的币别代码默认按 2 位处理（与 Angular UI 自身的回退逻辑一致）。一旦违反 -> 返回 400 REQUEST_VALIDATION_FAILED，错误信息中会同时注明实际小数位数与允许的小数位数。这是业务驱动的规则（例如"JPY 10000 不带分"）。

## Source Evidence

- `test/unit/app.test.ts:1817-1885`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
