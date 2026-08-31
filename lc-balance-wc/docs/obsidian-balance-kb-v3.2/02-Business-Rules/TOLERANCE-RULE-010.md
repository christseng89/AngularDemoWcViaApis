---
knowledge_id: TOLERANCE-RULE-010
title: "按币别强制小数位精度——服务端兜底校验，未知币别默认 2 位小数，并已接入请求校验 schema"
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

# TOLERANCE-RULE-010 — 按币别强制小数位精度——服务端兜底校验，未知币别默认 2 位小数，并已接入请求校验 schema

## Status
CONFIRMED

## Business Rule
金额实际写出的小数位数不得超过其币别所配置的最小货币单位精度（CURRENCY_MINOR_UNITS；JPY/TWD/IDR/KRW/VND/CLP/ISK=0，BHD/IQD/JOD/KWD/OMR/TND=3，其余币别一律默认为 2，而不是被跳过不校验），由 describeAmountScaleViolation() 强制执行；该函数已接入 src/validation/requestSchema.ts 的 zod 请求校验 schema（此点已确认，而非仅属推测），从而也接入了 POST /balance-movements。

## Conditions
通过 POST /balance-movements 提交金额及其对应币别代码时。

## Result
金额的小数位数 > 该币别所允许的最小货币单位精度 => 校验失败，错误信息会同时说明实际小数位数与允许的小数位数。

## Example
amount '10000.50', currency JPY => 'amount "10000.50" has 2 decimal place(s) but currency JPY allows at most 0'。

## Verification Note
合并了两份高度重叠的候选条目（一份直接引用 money.ts，另一份引用 api.yaml 中 MonetaryAmount schema 对同一规则的描述）。通过直接确认其已接入 requestSchema.ts，将其中一份候选条目原本仅"推测"的接入关系提升为已确认，从而提高了置信度。维持 CONFIRMED。

## Source Evidence

Implementation:
- `microservices/balance-component/src/money.ts:44-107 (verified verbatim, including the deliberate 2dp-fallback-vs-skip departure from the sibling payment-component project)`
- `microservices/balance-component/src/validation/requestSchema.ts:19,43 (confirms wiring into the zod schema — resolves the 'presumably' uncertainty in one of the merged candidates)`
- `analysis/balance-component-api.yaml:1264-1272 (MonetaryAmount schema description, corroborating)`

Tests:
- `microservices/balance-component/test/unit/errorsAndMoney.test.ts:53-108 (verified — full CURRENCY_MINOR_UNITS table test.each, case-insensitivity, describeAmountScaleViolation messages)`
- `microservices/balance-component/test/unit/validation/requestSchema.test.ts (cited by candidate, not independently re-read this pass)`

## Related Knowledge
- [[Tolerance Processing]]
- CURRENCY_MINOR_UNITS — 服务端按币别强制小数位精度，未知币别默认 2 位小数
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
