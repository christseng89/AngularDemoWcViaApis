---
knowledge_id: loadcheckerqueue-pending-candidate-inclusion-filter
title: "loadCheckerQueue() PENDING 候选项纳入过滤逻辑"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# loadCheckerQueue() PENDING 候选项纳入过滤逻辑

| Selected Function Group（所选功能分组） | status | movementTypeMatchesFunction | acknowledgedAt | makerSubmittedAt | Included in checkerItems?（是否纳入 checkerItems） |
|---|---|---|---|---|---|
| 任意功能 | != PENDING | 不适用 | 不适用 | 不适用 | 否 |
| 任意功能 | PENDING | false（此功能对应的 movementType 不匹配） | 不适用 | 不适用 | 否 |
| A3/A3S（deferSettlement） | PENDING | true | 已设置（已确认） | 不适用 | 否——已排除，已处于 EARMARKED，A3/A3S 已无待办事项 |
| A3/A3S（deferSettlement） | PENDING | true | null（仍在 EARMARKING） | 不适用 | 是 |
| A4（releasesExistingMovementInPlace） | PENDING | true | null（仍在 EARMARKING） | 不适用 | 否——尚未经 A3/A3S 自身的 Checker 确认 |
| A4（releasesExistingMovementInPlace） | PENDING | true | 已设置（EARMARKED） | null（尚未 Maker-Submitted） | 否——A4 需先 Submit 后才能 Approve |
| A4（releasesExistingMovementInPlace） | PENDING | true | 已设置（EARMARKED） | 已设置 | 是 |
| 其他所有功能（例如 A6/B4，其队列面向新建的 Acceptance/资产记录，而非源头的 UTILIZE） | PENDING | true | 不适用（不涉及 EARMARKING/EARMARKED 划分） | 不适用 | 是 |

## Source Evidence

- `checker-panel.component.ts:232-293`
- `checker-panel.component.spec.ts:496-619`

## Related Knowledge

- Angular Checker Panel + Actions
- [[Business-Rule-Index]]
