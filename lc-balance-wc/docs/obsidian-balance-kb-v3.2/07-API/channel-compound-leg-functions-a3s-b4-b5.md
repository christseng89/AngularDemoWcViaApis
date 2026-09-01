---
knowledge_id: channel-compound-leg-functions-a3s-b4-b5
title: 'Channel 复合分腿功能：A3S、B4（B5 为单腿）'
domain: Balance
category: Domain Concept
status: CONFIRMED
snapshot_date: 2026-09-01
tags:
  - balance
  - api
  - compound
---

# Channel 复合分腿功能：A3S、B4（B5 为单腿）

Channel OAS 的现行 compound function 是 A3S 与 B4：

- A3S：SHGT redemption + LC UTILIZE。
- B4 Sight：HONOUR + `EPLC_DUE_FROM_ISSUING_BANK/CREATE`。
- B4 Usance：ACCEPT + `EPLC_ACCEPTANCE/CREATE` + `EPLC_ACCEPTANCE_REIMB_RECEIVABLE/CREATE`。
- B5：`compoundLegs: []`，仅提交一个 Acceptance FULL/PARTIAL_SETTLE。

## Source evidence

- `analysis/balance-component-channel-api.yaml` v1.11.0
- `src/app/transaction-builder/function-strategy.ts`

## Related knowledge

- [[Function-API Integration Map]]
- [[B5-Settlement-Reimbursement-Maturity]]
