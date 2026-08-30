---
knowledge_id: currency-minor-units-server-side-amount-decimal-scale-table
title: "CURRENCY_MINOR_UNITS——服务端金额小数位精度表"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# CURRENCY_MINOR_UNITS——服务端金额小数位精度表

| 币种代码 | 允许的小数位数 |
|---|---|
| JPY, TWD, IDR, KRW, VND, CLP, ISK | 0 |
| BHD, IQD, JOD, KWD, OMR, TND | 3 |
| 其他任意币种（如 USD、EUR） | 2（默认兜底值——始终会执行此项检查） |

## 来源证据

- `microservices/balance-component/src/money.ts:63-82`
- `microservices/balance-component/test/unit/errorsAndMoney.test.ts:57-84`

## 相关知识

- Data Model — DB Schema, Migrations, Stores, Types/Money/Errors
- [[Business-Rule-Index]]
