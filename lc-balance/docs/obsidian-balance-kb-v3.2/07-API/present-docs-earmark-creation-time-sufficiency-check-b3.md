---
knowledge_id: present-docs-earmark-creation-time-sufficiency-check-b3
title: "Present Docs Earmark 创建时点的充足性检查（B3）"
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

# Present Docs Earmark 创建时点的充足性检查（B3）

创建一笔 EPLC_EXAMINATION（Present Docs 交单）时，会对照父级 EPLC_CONFIRMATION 自身的「经 Present Earmark 调整后的 Tight Available Balance」进行检查——即 Confirmed Balance 减去仍处于 PENDING 状态的减少额，再减去已存在的 Present Docs earmark（来自其他仍处于 PENDING/或已 RELEASED 但尚未被消费的交单）。超出该额度 -> 返回 409 INSUFFICIENT_AVAILABLE_BALANCE，错误信息中会逐项列出该公式的各个组成部分。一笔金额恰好等于剩余可用空间的交单可以成功创建（201，PENDING）；该 Movement 从不过账 accountEntries（MEMO_ONLY），也从不改变该 Confirmation 自身的 Confirmed/Available Balance。

## Source Evidence

- `test/unit/app.test.ts:1490-1626`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
