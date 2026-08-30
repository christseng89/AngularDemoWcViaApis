---
knowledge_id: displaystatus-statusbadgeclass-combined-resolution
title: "displayStatus() / statusBadgeClass() 综合解析逻辑"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# displayStatus() / statusBadgeClass() 综合解析逻辑

| movementType | status | isEarmarkFunction() | acknowledgedAt | displayStatus() 显示文案 | statusBadgeClass() 输出 |
|---|---|---|---|---|---|
| CLOSE（任意 instrumentType） | PENDING | 不适用 | 不适用 | CLOSING | tb-status-badge--negative |
| CLOSE（任意 instrumentType） | RELEASED | 不适用 | 不适用 | CLOSED | tb-status-badge--negative |
| CLOSE（任意 instrumentType） | REJECTED / CANCELLED | 不适用 | 不适用 | REJECTED / CANCELLED（不变） | tb-status-badge--negative（走一般处理逻辑，非 CLOSE 特殊分支） |
| 非 CLOSE，earmark 组合 | PENDING | true | 已设置 | EARMARKED | tb-status-badge--earmark |
| 非 CLOSE，earmark 组合 | PENDING | true | null/undefined | EARMARKING | tb-status-badge--pending |
| 非 CLOSE，earmark 组合 | RELEASED | true | 不适用 | EARMARKED | tb-status-badge--earmark |
| 非 CLOSE，非 earmark 组合 | PENDING | false | 不适用 | PENDING | tb-status-badge--pending |
| 非 CLOSE，非 earmark 组合 | RELEASED | false | 不适用 | APPROVED | tb-status-badge--approved |
| 任意 | REJECTED / CANCELLED | 不适用 | 不适用 | REJECTED / CANCELLED（不变） | tb-status-badge--negative |
| 任意 | SUPERSEDED | 不适用 | 不适用 | SUPERSEDED（不变） | tb-status-badge--neutral |
| 任意 | 未识别的状态字符串 | 不适用 | 不适用 | 不变 | ''（空） |

## Source Evidence

- `balance-component.model.ts:544-560`
- `balance-component.model.ts:617-631`
- `balance-component.model.spec.ts:811-845（CLOSE 分支在此 spec 文件中有直接测试覆盖；本表所示由 acknowledgedAt 驱动的 EARMARKED/EARMARKING 区分，是从代码自身逻辑推导得出，并未被此 spec 文件直接测试覆盖——详见 gaps）`

## Related Knowledge

- Angular Domain Model (balance-component.model.ts)
- [[Business-Rule-Index]]
