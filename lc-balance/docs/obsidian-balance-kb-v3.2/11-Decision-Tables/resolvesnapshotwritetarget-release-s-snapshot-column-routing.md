---
knowledge_id: resolvesnapshotwritetarget-release-s-snapshot-column-routing
title: "resolveSnapshotWriteTarget() ——release() 的快照列路由"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# resolveSnapshotWriteTarget() ——release() 的快照列路由

| isSightUtilizeFinalize | 写入的 eventSnapshot 字段 | 写入的 acceptanceEventSnapshot 字段 | 写入的 sgEventSnapshot 字段 |
|---|---|---|---|
| true（A4 正在终结一笔 Sight A3/A3S 的 UTILIZE） | finalizeEventSnapshot | finalizeAcceptanceEventSnapshot | finalizeSgEventSnapshot |
| false（其余所有 release() 情形） | eventSnapshot | acceptanceEventSnapshot | sgEventSnapshot |

## Source Evidence

- `balanceService.ts:788-815`
- `balanceService.ts:1198-1223`

## Related Knowledge

- Maker/Checker Service Orchestration (balanceService.ts)
- [[Business-Rule-Index]]
