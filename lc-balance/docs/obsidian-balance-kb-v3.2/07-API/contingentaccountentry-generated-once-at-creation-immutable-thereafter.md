---
knowledge_id: contingentaccountentry-generated-once-at-creation-immutable-thereafter
title: "contingentAccountEntry 仅在创建时生成一次，此后不可变"
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

# contingentAccountEntry 仅在创建时生成一次，此后不可变

每一笔范围内（in-scope）的 movement，在创建时都会计算并存储恰好一对 Dr/Cr 的 contingentAccountEntry；即使实时余额此后已经发生变化，该字段在被重新读取时也从不会被重新计算。具有反向作用的 movement（例如 ISSUE 之后的 AMEND_DECREASE，或 ISSUE 之后的 SHGT FULL_REDEEM）会得到与之镜像的 Dr/Cr 对。范围之外（out-of-scope）的表内资产类工具（EPLC_DUE_FROM_ISSUING_BANK）恒携带一个 null 条目，这与 Balance Component 自身"仅限或有负债"的范围边界相一致。

## Source Evidence

- `test/unit/app.test.ts:2942-3148`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
