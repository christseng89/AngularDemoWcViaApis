---
knowledge_id: TOLERANCE-RULE-009
title: "MonetaryAmount 报文字符串格式：最多 18 位整数、最多 3 位小数、可选正负号"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - tolerance
  - confirmed
---

# TOLERANCE-RULE-009 — MonetaryAmount 报文字符串格式：最多 18 位整数、最多 3 位小数、可选正负号

## Status
CONFIRMED

## Business Rule
在依据报文中的金额构造 Decimal，或返回格式化数值之前，任何货币金额都必须符合 /^-?\d{1,18}(\.\d{1,3})?$/ 格式。

## Conditions
调用 parseMonetaryAmount(value) 或 formatMonetaryAmount(value, scale) 时。

## Result
不符合格式的输入会抛出 InvalidMonetaryAmountError；此外，formatMonetaryAmount 还会针对其自身四舍五入后的输出结果重新校验同一格式，因此若所请求的小数位数（scale）本身就会违反该格式（例如 scale:4），同样会抛出异常。

## Example
formatMonetaryAmount(new Decimal('100.12345'), 4) 会抛出 InvalidMonetaryAmountError，因为真实产生的 4 位小数结果违反了 3 位小数的格式上限。

## Verification Note
已对照源码与测试文件直接验证。未降级。

## Source Evidence

Implementation:
- `microservices/balance-component/src/money.ts:12-36 (verified verbatim)`

Tests:
- `microservices/balance-component/test/unit/errorsAndMoney.test.ts:28-51 (verified verbatim, including the scale:4 edge case)`

## Related Knowledge
- [[Tolerance Processing]]
- money.ts — 由报文字符串构造 Decimal 的唯一权威来源
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
