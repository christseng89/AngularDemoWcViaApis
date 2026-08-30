---
knowledge_id: maker-checker-lifecycle-across-the-action-endpoints
title: "跨动作端点的 Maker/Checker 生命周期"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# 跨动作端点的 Maker/Checker 生命周期

一笔 PENDING 状态的 Movement 可以如何流转，以及哪些端点在哪些状态下是合法的——涵盖标准的放行/驳回/取消路径，以及两个从不改变状态本身的可选次要动作端点（maker-submit、acknowledge）。

```mermaid
flowchart TD
  P[PENDING
由 Maker 创建] -->|POST /:id/release
releasedBy 为必填| R[RELEASED]
  P -->|POST /:id/reject
releasedBy+reasonCode 为必填| J[REJECTED]
  P -->|POST /:id/cancel
cancelledBy 为必填，且必须是 Maker 本人的记录| X[CANCELLED]
  P -->|POST /:id/maker-submit
仅限 IPLC_LC/UTILIZE，设置 makerSubmittedAt
状态仍保持 PENDING| P
  P -->|POST /:id/acknowledge
仅限 IPLC_LC/UTILIZE，设置 acknowledgedAt
状态仍保持 PENDING| P
  R -->|再次 POST /:id/release| E1[409 ILLEGAL_STATE_TRANSITION]
  R -->|POST /:id/reject| E1
  R -->|POST /:id/cancel| E1
  R -->|POST /:id/maker-submit| E1
  P -->|Sight IPLC_LC/UTILIZE：
未先执行 maker-submit 即放行| E2[409 ILLEGAL_STATE_TRANSITION
要求先有 Maker Submit]
```

## Source Evidence

- `src/routes/balanceMovements.ts:25-82`
- `test/unit/app.test.ts:1924-2035`
- `test/unit/app.test.ts:1282-1406`
- `test/unit/app.test.ts:2464-2811`

## Related Knowledge

- Express Routes + End-to-End API Behavior
- [[Business-Rule-Index]]
