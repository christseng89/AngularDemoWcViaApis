---
knowledge_id: checker-action-routing-by-compound-submission-shape
title: '按组合提交形态路由的 Checker 动作'
domain: Balance
category: Domain Concept
status: CONFIRMED
snapshot_date: 2026-09-01
tags:
  - balance
  - maker-checker
---

# 按组合提交形态路由的 Checker 动作

`CheckerActionsService.release()` 依据 `FunctionStrategy` 路由：

1. A6 `settlesDocumentArrival`：解析同 LC 的 source Document Arrival，按 A6 顺序释放 source 与 Acceptance。
2. B4 `settlesDocumentArrival + sourceAlreadyReleasedBeforePick`：验证已 RELEASED 且未消费的 B3 source，再执行 B4 compound release；不会重复释放 B3。
3. A3S `documentArrivalWithSg`：使用 compound release 处理 SG redemption 与 LC UTILIZE。
4. 其余功能（包含 B5）：对 selected Checker movement 执行一次普通 release。

B5 不再使用 compound Checker 分支，也不解析 Reimbursement Receivable。

## Source evidence

- `src/app/transaction-builder/checker-actions.service.ts`
- `src/app/transaction-builder/checker-actions.service.spec.ts`

## Related knowledge

- [[compound-submission-linked-legs]]
- [[B5-Settlement-Reimbursement-Maturity]]
