---
knowledge_id: requestschema-ts-zod-schema-for-post-balance-movements-scoped-to-exact
title: "requestSchema.ts——POST /balance-movements 的 zod schema，范围严格限定于既有的手写检查"
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

# requestSchema.ts——POST /balance-movements 的 zod schema，范围严格限定于既有的手写检查

createMovementRequestSchema 要求 instrumentType、movementType、eventSeq（数字）、amount、currency、createdBy 必须非空/存在，并使用 .passthrough()，使得其他所有字段（naturalKey、balanceContractId、tolerancePct、tenorType、parentLogicalContractId、sourceTransactionRef 等）都会被原样接受，不经过这个 schema 校验。它还会执行一个 superRefine，先依据 MONETARY_AMOUNT_PATTERN 检查 amount（若格式不合法，只报一次，不会重复报），只有在格式合法的前提下，才会接着检查 describeAmountScaleViolation(amount, currency)。firstValidationMessage() 只会呈现第一个 zod 问题，与该路由原本“一次只显示一条讯息”的既有惯例保持一致。

## 来源证据

- `microservices/balance-component/src/validation/requestSchema.ts:1-57`
- `microservices/balance-component/test/unit/validation/requestSchema.test.ts:1-89`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
