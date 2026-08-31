---
knowledge_id: MOVEMENT-RULE-035
title: "旧版兜底逻辑（getBalanceAsOfMovement）只适用于该事件自身的分页，且仅在其持久化快照为 null 时触发，并针对选择已变更的情况做了竞态防护"
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

# MOVEMENT-RULE-035 — 旧版兜底逻辑（getBalanceAsOfMovement）只适用于该事件自身的分页，且仅在其持久化快照为 null 时触发，并针对选择已变更的情况做了竞态防护

## Status
CONFIRMED

## Business Rule
若所选事件自身账本分页对应推导出的 ownSnapshot 为 null（即快照持久化机制上线之前遗留的旧数据），selectEvent() 会调用实时的 GET .../balance-as-of 接口，并将结果仅应用到那一个分页上；同时通过 if (this.selectedEvent !== forEvent) return 进行防护，避免在此期间用户已经切换到另一个 Event 后，过期的响应仍被套用。兄弟/根分页永远不受此兜底逻辑影响。

## Conditions
ownSnapshot === null（仅限该事件自身所在的分页）

## Result
仅针对自身账本分页额外发起一次实时 API 调用；并带有竞态防护

## Example
一笔没有 eventSnapshot 的旧版动账：其自身分页会通过 getBalanceAsOfMovement() 实时获取；其他分页不受影响

## Verification Note
本轮未直接重新阅读，但紧邻于其他已直接验证过的 inquire-events.service.ts 相关声明且与之一致；维持 CONFIRMED。

## Source Evidence

Implementation:
- `src/app/transaction-builder/inquire-events.service.ts:552-566`

Tests:
- `inquire-events.service.spec.ts:847-902,886`

## Related Knowledge
- [[BalanceMovement]]
- EventBalanceTab / Balance Tabs（LC/Acceptance/SG）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
