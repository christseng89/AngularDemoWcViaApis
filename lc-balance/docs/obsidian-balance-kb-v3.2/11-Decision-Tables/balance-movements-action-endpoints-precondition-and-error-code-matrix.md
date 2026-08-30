---
knowledge_id: balance-movements-action-endpoints-precondition-and-error-code-matrix
title: "balance-movements 操作端点——前置条件与错误码矩阵"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# balance-movements 操作端点——前置条件与错误码矩阵

| 端点 | 必填请求体字段 | 金融工具／movementType 限制 | 重复调用行为 | 终态行为 |
|---|---|---|---|---|
| POST /:id/release | releasedBy | 无（任意 PENDING movement 均可） | 若已处于 RELEASED/REJECTED/CANCELLED，返回 409 ILLEGAL_STATE_TRANSITION | 对于即期（Sight）IPLC_LC/UTILIZE，若 makerSubmittedAt 为空，还会额外返回 409 |
| POST /:id/reject | releasedBy, reasonCode | 无 | 若非 PENDING，返回 409 ILLEGAL_STATE_TRANSITION | 状态置为 REJECTED，永不计入余额 |
| POST /:id/cancel | cancelledBy（reasonCode 可选，默认 MAKER_EC） | 无（仅限 Maker 本人所属的 PENDING 记录） | 若非 PENDING，返回 409 ILLEGAL_STATE_TRANSITION | 状态置为 CANCELLED，写入独立的 cancelledBy/cancelledAt 组合 |
| POST /:id/acknowledge | acknowledgedBy | 仅限 IPLC_LC/UTILIZE（否则返回 400） | 第二次调用返回 409 ILLEGAL_STATE_TRANSITION（"already acknowledged by X"） | 状态不变（仍为 PENDING） |
| POST /:id/maker-submit | makerSubmittedBy | 仅限 IPLC_LC/UTILIZE（否则返回 400） | 第二次调用、或已处于 RELEASED 时返回 409 ILLEGAL_STATE_TRANSITION（"not PENDING"） | 状态不变（仍为 PENDING） |

## 来源证据

- `src/routes/balanceMovements.ts:25-82`
- `test/unit/app.test.ts:1924-2035`
- `test/unit/app.test.ts:1282-1406`
- `test/unit/app.test.ts:2464-2729`

## 相关知识

- Express Routes + End-to-End API Behavior
- [[Business-Rule-Index]]
