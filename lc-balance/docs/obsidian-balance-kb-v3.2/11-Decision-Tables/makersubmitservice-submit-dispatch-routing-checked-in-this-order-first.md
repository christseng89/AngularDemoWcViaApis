---
knowledge_id: makersubmitservice-submit-dispatch-routing-checked-in-this-order-first
title: 'MakerSubmitService.submit() 分发路由'
domain: Balance
category: Decision Table
snapshot_date: 2026-09-01
tags:
  - balance
  - decision-table
---

# MakerSubmitService.submit() 分发路由

| #   | 条件                  | 调用形态                                 | 写入                                                            |
| --- | --------------------- | ---------------------------------------- | --------------------------------------------------------------- |
| 1   | A3S 且已选择 SG       | `submitDocumentArrivalWithSg`            | atomic compound：SG redemption + LC UTILIZE                     |
| 2   | B4 HONOUR             | `submitConfirmationHonourWithReceivable` | atomic compound：HONOUR + Due From Issuing Bank CREATE          |
| 3   | B4 ACCEPT             | `submitConfirmationAcceptWithReceivable` | atomic compound：ACCEPT + Acceptance CREATE + Receivable CREATE |
| 4   | 以上均未命中，包括 B5 | `submitPlain`                            | 一笔 movement                                                   |

B5 的 `SETTLE` 只负责推导 `FULL_SETTLE`／`PARTIAL_SETTLE`，不会触发额外 Receivable lookup 或 movement。

## Source evidence

- `src/app/transaction-builder/maker-submit.service.ts`
- `src/app/transaction-builder/maker-submit.service.spec.ts`
