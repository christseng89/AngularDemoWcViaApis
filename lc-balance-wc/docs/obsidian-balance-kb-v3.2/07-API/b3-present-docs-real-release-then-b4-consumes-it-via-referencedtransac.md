---
knowledge_id: b3-present-docs-real-release-then-b4-consumes-it-via-referencedtransac
title: "B3（Present Docs）真实放行，随后 B4 通过 referencedTransactionId 消费它"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# B3（Present Docs）真实放行，随后 B4 通过 referencedTransactionId 消费它

端到端的出口（Export）流程：B3 创建一笔 MEMO_ONLY 的 EPLC_EXAMINATION，由其自身的 Checker 真正放行（将 Present Docs Earmark 从 Pending 移至 Approved），之后 B4 自身的复合 HONOUR/ACCEPT 通过引用的方式消费它，而不是重新放行它。

```mermaid
flowchart TD
  A[B3：POST /balance-movements
EPLC_EXAMINATION CREATE
按经 Present-Earmark 调整后的
Tight Available Balance 校验] -->|201 PENDING
MEMO_ONLY，无 accountEntries| B[presentDocsEarmarkPending += amount]
  B --> C[POST /:id/release
由 B3 自身的 Checker 执行]
  C -->|200 RELEASED| D[presentDocsEarmarkPending -= amount
presentDocsEarmarkApproved += amount
presentDocsConsumedAt 仍为 null]
  D --> E[B4：POST /balance-movements
HONOUR/ACCEPT，referencedTransactionId
= 该 B3 的 movementId]
  E -->|201 PENDING| F[对该 B4 movement 调用 POST /:id/release]
  F -->|200 RELEASED| G[B3 记录的 presentDocsConsumedAt
作为附带效果被设置
B4 自身的 release() 调用
不会再次对 B3 调用 release()]
  D -.->|尝试对同一笔 B3 movement
再次调用 POST /:id/release| H[409 ILLEGAL_STATE_TRANSITION]
```

## Source Evidence

- `test/unit/app.test.ts:1587-1626`
- `test/unit/app.test.ts:1635-1792`

## Related Knowledge

- Express Routes + End-to-End API Behavior
- [[Business-Rule-Index]]
