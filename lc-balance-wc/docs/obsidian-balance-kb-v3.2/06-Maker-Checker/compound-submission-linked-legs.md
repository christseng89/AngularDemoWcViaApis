---
knowledge_id: compound-submission-linked-legs
title: '组合提交（Compound Submission）/ 关联 Leg'
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: 'N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]'
snapshot_date: 2026-09-01
tags:
  - balance
  - domain-concept
---

# 组合提交（Compound Submission）/ 关联 Leg

SubmissionShape 包含 `plain`、`documentArrivalWithSg`（A3S）、`confirmationHonourWithReceivable` 与 `confirmationAcceptWithReceivable`（B4）。A3S／B4 的 compound submit 与 release 由微服务在同一数据库交易中处理。A6 使用 `referencedTransactionId` 关联既有 Document Arrival。B5 使用 `plain`，只结算所选 Acceptance，不查找或处理 Reimbursement Receivable。

## Source Evidence

- `src/app/transaction-builder/function-strategy.spec.ts lines 48-72`
- `src/app/transaction-builder/function-strategy.ts lines 34-40, 143-156`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
