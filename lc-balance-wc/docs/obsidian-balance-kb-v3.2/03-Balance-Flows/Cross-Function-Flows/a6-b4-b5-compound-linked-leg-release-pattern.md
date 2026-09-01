---
knowledge_id: a6-b4-b5-compound-linked-leg-release-pattern
title: 'A6 / B4 关联腿 release 与 B5 单腿结算对照'
domain: Balance
category: Domain Concept
status: CONFIRMED
snapshot_date: 2026-09-01
tags:
  - balance
  - maker-checker
  - compound
---

# A6 / B4 关联腿 release 与 B5 单腿结算对照

A6 与 B4 都关联既有 source movement。A6 的 Acceptance CREATE 引用同 LC 的 A3／A3S Document Arrival；Checker 依序处理 source 与新 Acceptance。B4 的 HONOUR／ACCEPT 引用同 Confirmation 的已 RELEASED、未消费 B3 Present Docs，并在 compound transaction 中建立所需资产／负债 legs。

B5 已不属于此 compound 家族。它只在所选 `EPLC_ACCEPTANCE` 上建立并放行一笔 `FULL_SETTLE` 或 `PARTIAL_SETTLE`；不会查找或处理 `EPLC_ACCEPTANCE_REIMB_RECEIVABLE`。

## Source evidence

- `src/app/transaction-builder/function-strategy.ts`
- `src/app/transaction-builder/maker-submit.service.ts`
- `src/app/transaction-builder/checker-actions.service.ts`
- `microservices/balance-component/src/service/movementReleasePolicyService.ts`

## Related knowledge

- [[compound-submission-linked-legs]]
- [[B5-Settlement-Reimbursement-Maturity]]
- [[Transaction Index Selection Contract]]
