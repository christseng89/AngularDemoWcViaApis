---
knowledge_id: b3-present-docs-eplc-examination-release-single-use-consumed-by-b4-not
title: "B3（Present Docs / EPLC_EXAMINATION）放行仅限一次性使用，由 B4 消费而非重复放行"
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

# B3（Present Docs / EPLC_EXAMINATION）放行仅限一次性使用，由 B4 消费而非重复放行

对一笔已经处于 RELEASED 状态的 EPLC_EXAMINATION movement 再次调用 POST .../release 会返回 409 ILLEGAL_STATE_TRANSITION（'not a legal transition'）——B4 自身的复合放行逻辑绝不能尝试重新放行它所引用的 B3 记录；相反，它会在放行自身关联的 HONOUR/ACCEPT movement（通过 referencedTransactionId 引用）时，把该 B3 记录标记为已消费（presentDocsConsumedAt）作为附带效果。

## Source Evidence

- `test/unit/app.test.ts:1620-1625`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
