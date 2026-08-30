---
knowledge_id: present-docs-earmark-buckets-eplc-examination-b3-b4
title: "Present Docs Earmark 分桶（EPLC_EXAMINATION / B3-B4）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# Present Docs Earmark 分桶（EPLC_EXAMINATION / B3-B4）

| 函数 | status 过滤条件 | presentDocsConsumedAt 过滤条件 | provisionallyConsumedIds 过滤条件 | 代表含义 |
|---|---|---|---|---|
| computePresentDocsEarmarkPending | status === 'PENDING' | 不适用（PENDING 期间恒为 null） | 不套用 | 已由 Maker 提交、尚未经 B3 Release 的交单 |
| computePresentDocsEarmarkApproved | status === 'RELEASED' | 必须为 null/falsy | 若已有 movementId 则排除 | 已经 B3 Release、但尚未被 B4 消耗的交单 |
| computePresentDocsEarmark（合计） | status ∈ {PENDING, RELEASED} | 必须为 null/falsy | 若已有 movementId 则排除 | 未平仓 earmark 总额 = Pending + Approved |

## Source Evidence

- `microservices/balance-component/src/domain/offBalanceExposure.ts:152-251`

## Related Knowledge

- [[Off-Balance-Sheet Exposure|表外敞口与或有科目分录]]
- [[Business-Rule-Index]]
