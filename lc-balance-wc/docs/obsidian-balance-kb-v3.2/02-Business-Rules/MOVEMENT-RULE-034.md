---
knowledge_id: MOVEMENT-RULE-034
title: "'finalize' 行读取其自身独立的 finalizeEventSnapshot（及 finalize 兄弟变体），若不存在则回退到创建时的快照"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - movement
  - confirmed
---

# MOVEMENT-RULE-034 — 'finalize' 行读取其自身独立的 finalizeEventSnapshot（及 finalize 兄弟变体），若不存在则回退到创建时的快照

## Status
CONFIRMED

## Business Rule
event.phase==='finalize' 时，LC 分页的快照会选取 movement.finalizeEventSnapshot（若为 null 则回退到 movement.eventSnapshot），兄弟分页则对应选取 finalizeAcceptanceEventSnapshot/finalizeSgEventSnapshot。而 'create'/'primary' 阶段始终直接读取普通的 eventSnapshot/acceptanceEventSnapshot/sgEventSnapshot。

## Conditions
event.phase === 'finalize' 相对于 'create'/'primary'

## Result
同一笔拆分动账的不同行，其快照来源各不相同

## Example
同一笔 UTILIZE 中，'create' 行为 a3CreateSnapshot（confirmedBalance 100000），'finalize' 行为 a4FinalizeSnapshot（confirmedBalance 60000）

## Verification Note
直接阅读了确切的源码行（已用 grep 确认 ownSnapshot 三元表达式及第 515 行的 sg 变体）；与声明完全一致。

## Source Evidence

Implementation:
- `src/app/transaction-builder/inquire-events.service.ts:507-515`

Tests:
- `inquire-events.service.spec.ts:184-196,199-211`

## Related Knowledge
- [[BalanceMovement]]
- EventBalanceTab / Balance Tabs（LC/Acceptance/SG）
- toEventRows() — create/finalize 行拆分
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
