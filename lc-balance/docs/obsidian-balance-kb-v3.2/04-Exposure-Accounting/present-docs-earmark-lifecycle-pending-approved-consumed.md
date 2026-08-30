---
knowledge_id: present-docs-earmark-lifecycle-pending-approved-consumed
title: "单据提示圈存生命周期：Pending → Approved → Consumed"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 本次分析快照中无 .git 历史记录，参见 [[Source-to-Knowledge-Map|来源知识对照表]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# 单据提示圈存生命周期：Pending → Approved → Consumed

一笔提示占用该圈存的期间，从 Maker 提交（PENDING）一路持续到 B3 自身真正的 Checker 解除（RELEASED）——只有当 presentDocsConsumedAt 被设置时，也就是当 B4 通过解除其自身关联的 HONOUR/ACCEPT 真正消耗掉它时，它才会退出圈存。computePresentDocsEarmarkPending 只汇总仍为 PENDING 的 CREATE；computePresentDocsEarmarkApproved 只汇总已 RELEASED 但尚未被消耗的 CREATE；computePresentDocsEarmark 则合计两者（Pending＋Approved）。这项设计（自 2026-08-18 的 B3 重新设计以来）在 B3 从 PENDING 过渡到 RELEASED 的过程中，保留了原本的额度控管意图——若没有 presentDocsConsumedAt 这道闸门，一笔真正已经 Released、但尚未被 B4 消耗的提示，会在其自身 Checker 核准的那一刻起就被错误地停止计入。

## Source Evidence

- `microservices/balance-component/src/domain/offBalanceExposure.ts:152-251`
- `test/unit/domain/offBalanceExposure.test.ts:49-80`

## Related Knowledge

- [[Business-Rule-Index|业务规则索引]]
- [[Balance Component Overview|余额组件概览]]
