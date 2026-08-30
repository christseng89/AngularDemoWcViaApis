---
knowledge_id: eventseq-0-is-a-real-meaningful-value-not-treated-as-missing
title: "eventSeq 为 0 是一个真实、有意义的值——不会被当作缺失处理"
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

# eventSeq 为 0 是一个真实、有意义的值——不会被当作缺失处理

zod schema 要求 eventSeq 必须是 number 类型；测试套件明确验证了 eventSeq:0 会被接受（不会因其为假值/被误判为缺失而被拒绝），而缺失 eventSeq 键或 eventSeq 非数字类型（例如字符串 '1'）则会被拒绝。这防范了一类常见的“假值校验”缺陷。

## 来源证据

- `microservices/balance-component/src/validation/requestSchema.ts:25`
- `microservices/balance-component/test/unit/validation/requestSchema.test.ts:41-56`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
