---
knowledge_id: checkeractionsservice-release-routing-by-function-shape
title: 'CheckerActionsService.release() 按功能形态的路由方式'
domain: Balance
category: Decision Table
snapshot_date: 2026-09-01
tags:
  - balance
  - decision-table
---

# CheckerActionsService.release() 按功能形态的路由方式

| FunctionStrategy 条件                                        | 适用对象                             | 放行链路                                                     | 成功结果                    |
| ------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------ | --------------------------- |
| `settlesDocumentArrival && sourceAlreadyReleasedBeforePick`  | B4                                   | 重验 B3 source 后执行 B4 compound release，不重复 release B3 | released                    |
| `settlesDocumentArrival && !sourceAlreadyReleasedBeforePick` | A6                                   | 解析并处理 Document Arrival source，再 release Acceptance    | released                    |
| `possibleShapes` 含 `documentArrivalWithSg`                  | A3S                                  | compound release SG redemption + LC UTILIZE                  | documentArrivalAcknowledged |
| 以上均不适用                                                 | A1、A2、A3、A4、A7–A11、B1–B3、B5–B7 | 对 selected movement 执行一次普通 release                    | released                    |

B5 不解析或 release Reimbursement Receivable。

## Source evidence

- `src/app/transaction-builder/checker-actions.service.ts`
- `src/app/transaction-builder/checker-actions.service.spec.ts`
