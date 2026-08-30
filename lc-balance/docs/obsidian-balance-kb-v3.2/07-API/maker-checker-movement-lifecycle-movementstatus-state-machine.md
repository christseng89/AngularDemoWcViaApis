---
knowledge_id: maker-checker-movement-lifecycle-movementstatus-state-machine
title: "Maker/Checker Movement 生命周期（MovementStatus 状态机）"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# Maker/Checker Movement 生命周期（MovementStatus 状态机）

每一笔 BalanceMovement 都遵循的通用 PENDING 生命周期，包括两个不触发状态迁移的旁路动作（maker-submit、acknowledge）——它们起到门禁作用，但从不推动状态前进。

```mermaid
flowchart TD
  Start([Maker: POST /balance-movements]) --> Pending[PENDING]
  Pending -.->|仅限 A4：POST /maker-submit 设置 makerSubmittedAt，状态不变| Pending
  Pending -.->|仅限 A3/A3S：POST /acknowledge 设置 acknowledgedAt，状态不变| Pending
  Pending -->|Checker：POST /release| Released[RELEASED]
  Pending -->|Checker：POST /reject + reasonCode| Rejected[REJECTED]
  Pending -->|Maker：POST /cancel| Cancelled[CANCELLED]
  Rejected -->|Maker：POST /cancel，earmark 释放为空操作| Cancelled
  Released --> End([Confirmed Balance 更新；accountEntries 可供下游会计组件使用；eventSnapshot 会被 RELEASED 覆写，除非本次是 Sight IPLC_LC UTILIZE 的 finalize，此时改为写入 finalizeEventSnapshot])
```

## Source Evidence

- `balance-component-api.yaml lines 900-1194, 292-355`

## Related Knowledge

- OpenAPI Specs — Microservice + Channel API
- [[Business-Rule-Index]]
