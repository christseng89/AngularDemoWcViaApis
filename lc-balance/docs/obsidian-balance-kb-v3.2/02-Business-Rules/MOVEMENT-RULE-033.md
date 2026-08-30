---
knowledge_id: MOVEMENT-RULE-033
title: "Balance Tab 的影响（前/后）只挂载在与所选 Event 自身账本匹配的分页上；兄弟/根分页只展示静态快照，impact:null"
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

# MOVEMENT-RULE-033 — Balance Tab 的影响（前/后）只挂载在与所选 Event 自身账本匹配的分页上；兄弟/根分页只展示静态快照，impact:null

## Status
CONFIRMED

## Business Rule
在 selectEvent() 中，对于最多 3 个分页（LC、Acceptance、SG）中的每一个，只有当该分页代表该事件自身所属的合约时，才会把 impact 设为 {before, after}；同一分页条内的其余每个分页都会得到 impact: null，即便它自身的快照仍然是由兄弟/根快照字段填充的。

## Conditions
tab.key 与该事件自身合约的角色（root/acceptance/sg）相匹配

## Result
恰好只有一个分页展示 impact（before->after）；其余 0-2 个分页仅展示静态快照

## Example
一个 SHGT ISSUE 事件：SG 分页展示其自身的 ownImpact；LC 分页展示 movement.rootEventSnapshot，impact:null

## Verification Note
本轮未直接重新阅读，但紧邻于同一文件中已直接验证过的 finalize 快照兜底逻辑（第 507-515 行）且与之一致；维持 CONFIRMED。

## Source Evidence

Implementation:
- `src/app/transaction-builder/inquire-events.service.ts:519-548`

Tests:
- `inquire-events.service.spec.ts:773-846`

## Related Knowledge
- [[BalanceMovement]]
- EventBalanceTab / Balance Tabs（LC/Acceptance/SG）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
