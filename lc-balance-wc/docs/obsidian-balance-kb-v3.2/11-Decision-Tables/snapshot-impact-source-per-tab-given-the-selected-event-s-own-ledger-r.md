---
knowledge_id: snapshot-impact-source-per-tab-given-the-selected-event-s-own-ledger-r
title: "按所选事件自身的账本角色与阶段划分各分页的快照/影响来源"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 按所选事件自身的账本角色与阶段划分各分页的快照/影响来源

| 所选事件自身的合约角色 | LC 分页快照 | LC 分页影响 | Acceptance 分页快照 | Acceptance 分页影响 | SG 分页快照 | SG 分页影响 |
|---|---|---|---|---|---|---|
| 根（LC）事件，阶段为 primary/create | movement.eventSnapshot | ownImpact（balanceBefore/After） | movement.acceptanceEventSnapshot（同胞） | null | movement.sgEventSnapshot（同胞） | null |
| 根（LC）事件，阶段为 finalize | movement.finalizeEventSnapshot ?? eventSnapshot | ownImpact | movement.finalizeAcceptanceEventSnapshot ?? acceptanceEventSnapshot | null | movement.finalizeSgEventSnapshot ?? sgEventSnapshot | null |
| Acceptance 事件 | movement.rootEventSnapshot | null | 自身 eventSnapshot（或 finalize 变体） | ownImpact | 不适用（除非该方同时也有 SG，但持有 Acceptance 的一方从不会同时出现 SG，故不显示 SG 分页） | 不适用 |
| SG（SHGT）事件 | movement.rootEventSnapshot | null | 不适用 | 不适用 | 自身 eventSnapshot（或 finalize 变体） | ownImpact |
| EPLC_EXAMINATION（B3）事件 | movement.rootEventSnapshot | null | 不适用（无专属分页） | 不适用 | 不适用 | 不适用 |

## Source Evidence

- `inquire-events.service.ts:502-548`
- `inquire-events.service.spec.ts:773-846`

## Related Knowledge

- Inquire Events + Look Up Current Balance (read-model)
- [[Business-Rule-Index]]
