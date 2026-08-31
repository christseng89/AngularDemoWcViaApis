---
knowledge_id: money-ts-sole-authority-for-constructing-a-decimal-from-a-wire-monetar
title: "money.ts——唯一被允许从电文金额字符串构造 Decimal 的权威模块"
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

# money.ts——唯一被允许从电文金额字符串构造 Decimal 的权威模块

money.ts 自身的文档注释声明，它是本服务中唯一被允许从电文（wire）金额字符串构造 Decimal 的模块，与姊妹的 payment-component 自身的约定保持一致。MONETARY_AMOUNT_PATTERN = /^-?\d{1,18}(\.\d{1,3})?$/（可选负号，最多 18 位整数，最多 3 位小数）把关 parseMonetaryAmount()；formatMonetaryAmount(value, scale) 通过 Decimal.ROUND_HALF_UP 进行舍入，并对输出结果重新以同一模式校验，如果指定的小数位数（例如 4 位）本身会产生一个不符合该模式的字符串，就抛出 InvalidMonetaryAmountError。

## 来源证据

- `microservices/balance-component/src/money.ts:1-42`
- `microservices/balance-component/test/unit/errorsAndMoney.test.ts:27-51`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
