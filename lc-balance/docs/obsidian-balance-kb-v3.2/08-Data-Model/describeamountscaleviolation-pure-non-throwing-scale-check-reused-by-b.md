---
knowledge_id: describeamountscaleviolation-pure-non-throwing-scale-check-reused-by-b
title: "describeAmountScaleViolation() ——纯函数、不抛异常的精度检查，供路由层与 zod schema 共用"
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

# describeAmountScaleViolation() ——纯函数、不抛异常的精度检查，供路由层与 zod schema 共用

给定一个已通过格式校验的金额字符串及其币种，如果该金额字面上的小数位数超过该币种配置的精度，则返回一条人类可读的违规说明信息，否则返回 null。刻意设计为纯函数、不抛异常，使其易于单元测试、也便于复用——routes/balanceMovements.ts（不在本次翻译范围内）与 validation/requestSchema.ts 中的 zod superRefine 均会调用它。

## 来源证据

- `microservices/balance-component/src/money.ts:95-107`
- `microservices/balance-component/src/validation/requestSchema.ts:31-47`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
