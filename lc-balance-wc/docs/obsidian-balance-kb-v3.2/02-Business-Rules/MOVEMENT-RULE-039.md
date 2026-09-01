---
knowledge_id: MOVEMENT-RULE-039
title: 'B4 复合放行顺序 — 主承兑/承付环节（同时会消耗其引用的 B3 记录）先于其关联的复合环节被放行'
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: 'N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]'
snapshot_date: 2026-08-22
tags:
  - balance
  - movement
  - confirmed
---

# MOVEMENT-RULE-039 — B4 复合放行顺序 — 主承兑/承付环节（同时会消耗其引用的 B3 记录）先于其关联的复合环节被放行

## Status

CONFIRMED

## Business Rule

B4 自身的主环节（针对 EPLC_CONFIRMATION 的 HONOUR/ACCEPT，携带 referencedTransactionIdRef 指向一条已放行的 B3 EPLC_EXAMINATION 记录）会先被放行——这一动作同时会把所引用的 B3 记录标记为『已消耗』，作为其副作用——随后才是其关联的复合环节（Sight/HONOUR 对应 EPLC_DUE_FROM_ISSUING_BANK，或 Usance/ACCEPT 对应 EPLC_ACCEPTANCE 与 EPLC_ACCEPTANCE_REIMB_RECEIVABLE 两者），这些关联环节共享主环节自身的 businessEventId。

## Conditions

B4 主环节（HONOUR 或 ACCEPT）引用一条 B3 记录，并与一个或多个关联环节共享同一个 businessEventId

## Result

在每一个案例的步骤顺序中，release(B4 主环节) 始终先于 release(关联环节)

## Example

export-case-6：先 release(honour) 再 release(dueFromIssuingBank)。export-case-7/9：先 release(accept)，再 release(acceptance)，再 release(reimbReceivable)

## Verification Note

直接阅读了确切的步骤顺序（第 1900-1997 行）；accept -> acceptance -> reimbReceivable 的放行顺序已逐字确认。

## Source Evidence

Implementation:

- `backend/data/businessCases.js:1902-1997`

Tests:

- `backend/test/server.test.js:159-184,208-234`

## Related Knowledge

- [[BalanceMovement]]
- A6 / B4 关联环节放行与 B5 单腿结算对照
- B3 真正执行 RELEASE；已废弃的仅 acknowledge() 设计
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
