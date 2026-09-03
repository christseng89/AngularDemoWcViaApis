---
knowledge_id: monetaryamount-decimal-string-currency-driven-scale
title: "MonetaryAmount——十进制字符串，精度由币种决定"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-09-03
tags:
  - balance
  - domain-concept
---

# MonetaryAmount——十进制字符串，精度由币种决定

两份 OAS 文件对 MonetaryAmount 的定义完全一致：一个匹配 ^-?\d{1,18}(\.\d{1,3})?$ 的字符串，绝不使用二进制浮点数/JSON number；服务端运算必须使用 decimal/BigDecimal。微服务 OAS 还进一步说明，实际允许的小数位数由币种决定（例如 JPY 为 0 位，多数币种为 2 位，BHD/KWD/OMR 为 3 位），若请求中的小数位数超过该币种自身允许的小数位数，将被以 400 拒绝。

## UI shorthand boundary（2026-09-03）

Transaction Builder 的可编辑 Amount 输入支持 `h/H`（百）、`k/K`（千）与 `m/M`（百万）的 additive shorthand，
例如 `20.5h = 2050`、`3h2h = 500`、`1m2k3h = 1002300`、`1h.25 = 100.25`。前端以
BigInt／decimal scale 精确展开并在 blur 后
写回标准 decimal string；`t/T` 明确不支持。此能力只存在于 UI 输入边界，HTTP／event OAS、数据库与
MonetaryAmount wire schema 均不接受 shorthand，也没有任何 contract 变更。

## Source Evidence

- `balance-component-api.yaml lines 1261-1272 (MonetaryAmount schema)`
- `balance-component-channel-api.yaml lines 573-577 (MonetaryAmount schema)`
- `src/app/transaction-builder/amount-shorthand.ts`
- `src/app/transaction-builder/builder-fields.ts`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
