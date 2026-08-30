---
knowledge_id: currency-minor-units-server-side-currency-decimal-scale-enforcement-un
title: "CURRENCY_MINOR_UNITS ——服务端货币小数精度强制校验，未知币种默认 2 位小数"
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

# CURRENCY_MINOR_UNITS ——服务端货币小数精度强制校验，未知币种默认 2 位小数

CURRENCY_MINOR_UNITS 列出了 13 个具有非默认小数位数的币种（JPY/TWD/IDR/KRW/VND/CLP/ISK = 0；BHD/IQD/JOD/KWD/OMR/TND = 3）。minorUnitsForCurrency() 对大小写不敏感并会去除空白字符，对任何未列出的币种均回退为 2 位小数。这一做法刻意背离了姊妹项目 payment-component 自身的约定（该项目对无法识别的币种会完全跳过精度检查，因为它拥有真实的 Currency-API 主数据）——因为本项目的 Currency 字段是自由输入、没有主数据来源的，对未知代码跳过检查将导致完全没有任何服务端强制校验，这比常见情形下默认 2 位小数的结果更糟。这一做法与 Angular 前端自身手工维护的 CURRENCY_DECIMALS 表保持一致（人工手动同步，代码/数值/回退值均相同）。

## 来源证据

- `microservices/balance-component/src/money.ts:44-107`
- `microservices/balance-component/test/unit/errorsAndMoney.test.ts:53-108`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
