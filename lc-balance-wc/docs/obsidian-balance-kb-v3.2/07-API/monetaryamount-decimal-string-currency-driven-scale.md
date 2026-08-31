---
knowledge_id: monetaryamount-decimal-string-currency-driven-scale
title: "MonetaryAmount——十进制字符串，精度由币种决定"
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

# MonetaryAmount——十进制字符串，精度由币种决定

两份 OAS 文件对 MonetaryAmount 的定义完全一致：一个匹配 ^-?\d{1,18}(\.\d{1,3})?$ 的字符串，绝不使用二进制浮点数/JSON number；服务端运算必须使用 decimal/BigDecimal。微服务 OAS 还进一步说明，实际允许的小数位数由币种决定（例如 JPY 为 0 位，多数币种为 2 位，BHD/KWD/OMR 为 3 位），若请求中的小数位数超过该币种自身允许的小数位数，将被以 400 拒绝。

## Source Evidence

- `balance-component-api.yaml lines 1261-1272 (MonetaryAmount schema)`
- `balance-component-channel-api.yaml lines 573-577 (MonetaryAmount schema)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
