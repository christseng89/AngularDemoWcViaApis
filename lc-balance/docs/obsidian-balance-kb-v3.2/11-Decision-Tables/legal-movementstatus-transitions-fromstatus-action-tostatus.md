---
knowledge_id: legal-movementstatus-transitions-fromstatus-action-tostatus
title: "合法的 MovementStatus 状态迁移（fromStatus, action）-> toStatus"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 合法的 MovementStatus 状态迁移（fromStatus, action）-> toStatus

| From status（起始状态） | Action（操作） | To status（目标状态） | Legal?（是否合法） |
|---|---|---|---|
| PENDING | RELEASE | RELEASED | 是 |
| PENDING | REJECT | REJECTED | 是 |
| PENDING | CANCEL | CANCELLED | 是 |
| PENDING | EDIT | SUPERSEDED | 是 |
| REJECTED | CANCEL | CANCELLED | 是 |
| REJECTED | EDIT | SUPERSEDED | 是 |
| REJECTED | RELEASE | — | 否——抛出 IllegalStateTransitionError |
| REJECTED | REJECT | — | 否——抛出 IllegalStateTransitionError |
| RELEASED | RELEASE / REJECT / CANCEL / EDIT | — | 否——均不合法，抛出异常 |
| CANCELLED | RELEASE / REJECT / CANCEL / EDIT | — | 否——均不合法，抛出异常 |
| SUPERSEDED | RELEASE / REJECT / CANCEL / EDIT | — | 否——均不合法，抛出异常 |

## Source Evidence

- `microservices/balance-component/src/domain/statusTransition.ts lines 23-29`
- `microservices/balance-component/test/unit/domain/statusTransition.test.ts (full file)`

## Related Knowledge

- Balance Derivation, Status Transition, Tenor Routing
- [[Business-Rule-Index]]
