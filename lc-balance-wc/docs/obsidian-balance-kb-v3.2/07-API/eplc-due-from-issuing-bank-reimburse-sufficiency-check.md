---
knowledge_id: eplc-due-from-issuing-bank-reimburse-sufficiency-check
title: "EPLC_DUE_FROM_ISSUING_BANK REIMBURSE 的充足性检查"
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

# EPLC_DUE_FROM_ISSUING_BANK REIMBURSE 的充足性检查

对一笔 EPLC_DUE_FROM_ISSUING_BANK 资产侧记录执行 REIMBURSE 时，校验的是该记录自身的 Available Balance（而非其父级 Confirmation 的 Available Balance）——一旦超出 -> 返回 409 INSUFFICIENT_AVAILABLE_BALANCE（'exceeds this record's Available Balance N'）。若恰好按全额偿付（Reimburse），该应收款的 Confirmed/Available Balance 会被放行至零。

## Source Evidence

- `test/unit/app.test.ts:1454-1488`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
