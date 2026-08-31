---
knowledge_id: row-split-and-eventtime-eventstatus-function-resolution-outcome-per-mo
title: "按 movement 形态划分的行拆分与 eventTime/eventStatus/function 解析结果"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 按 movement 形态划分的行拆分与 eventTime/eventStatus/function 解析结果

| instrumentType | movementType | tenorType | status | releasedAt 是否已设置？ | 产生的行数 | eventTime 来源 | 解析出的功能 |
|---|---|---|---|---|---|---|---|
| IPLC_LC | UTILIZE | SIGHT | PENDING | 不适用（尚无 releasedAt） | 1（主行） | createdAt | A3 |
| IPLC_LC | UTILIZE | SIGHT | RELEASED/REJECTED/CANCELLED | 是 | 2（create + finalize） | create：createdAt / finalize：releasedAt | create：A3 / finalize：A4 |
| IPLC_LC | UTILIZE | BUYERS_USANCE/SELLERS_USANCE/DP/DA | 任意 | 任意 | 1（主行） | createdAt | A3（A6 一律改为另行创建自己独立的 Acceptance movement） |
| 其他任何 instrumentType/movementType 组合 | - | - | 任意 | 任意 | 1（主行） | createdAt | 由 resolveFunctionForMovement() 查表解析 |

## Source Evidence

- `inquire-events.service.ts:82-96`
- `inquire-events.service.spec.ts:142-239`

## Related Knowledge

- Inquire Events + Look Up Current Balance (read-model)
- [[Business-Rule-Index]]
