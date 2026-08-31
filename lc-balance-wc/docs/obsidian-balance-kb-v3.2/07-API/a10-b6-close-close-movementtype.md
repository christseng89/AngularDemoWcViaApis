---
knowledge_id: a10-b6-close-close-movementtype
title: "A10/B6 关闭（CLOSE movementType）"
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

# A10/B6 关闭（CLOSE movementType）

v1.16.0 为根级 IPLC_LC/EPLC_LC/EPLC_CONFIRMATION 新增了 movementType CLOSE——作为放行（release）的附带效果，冲销剩余的 Confirmed Balance，并将合约状态置为 ContractStatus.CLOSED。方向与 AMEND_DECREASE/UTILIZE 相同（-1）。由一个专门的资格提示端点（GET /balance-contracts/close-eligible）支撑，并在 Submit 与 Release 两个阶段以完全相同的方式重新校验。

## Source Evidence

- `balance-component-api.yaml lines 456-488 (v1.16.0 top-level changelog)`
- `balance-component-api.yaml lines 616-666, 805-813, 953-959 (endpoint descriptions)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
