---
knowledge_id: compound-submission-linked-legs
title: "组合提交（Compound Submission）/ 关联 Leg"
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

# 组合提交（Compound Submission）/ 关联 Leg

一共存在 5 种 SubmissionShape：'plain'（默认，绝大多数功能使用）、'documentArrivalWithSg'（A3S）、'confirmationHonourWithReceivable'/'confirmationAcceptWithReceivable'（B4，具体在提交时由派生出的 movementType 决定）、'acceptanceSettleWithReceivable'（B5）。B4 是唯一能够从同一条注册表条目产生两种不同形态的功能。同一次组合提交的关联 leg 共享一个 businessEventId（或者对于 A6/B4 自身的上游源记录，使用 referencedTransactionId），这正是一个真正独立的 Checker 会话之后能够重新解析并一起释放两条 leg 的依据。

## Source Evidence

- `src/app/transaction-builder/function-strategy.spec.ts lines 48-72`
- `src/app/transaction-builder/function-strategy.ts lines 34-40, 143-156`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
