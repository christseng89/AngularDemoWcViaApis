---
knowledge_id: dr-cr-side-assignment-by-netdirection
title: "按 netDirection 确定借/贷方（Dr/Cr side assignment）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 按 netDirection 确定借/贷方（Dr/Cr side assignment）

| netDirection | drAccount（借方账户） | crAccount（贷方账户） | 典型 movementType |
|---|---|---|---|
| +1（建立） | family.establishDr（如适用则带上 tenor 后缀） | family.establishCr（如适用则带上 tenor 后缀） | ISSUE、AMEND_INCREASE、CREATE、AMEND（正金额） |
| -1（释放） | family.establishCr | family.establishDr | AMEND_DECREASE、UTILIZE、PARTIAL_REDEEM、FULL_REDEEM、PARTIAL_SETTLE、FULL_SETTLE、HONOUR、ACCEPT、AMEND（负金额） |

## Source Evidence

- `microservices/balance-component/src/domain/contingentAccountEntry.ts:140-150`

## Related Knowledge

- [[Off-Balance-Sheet Exposure|表外风险敞口与或有科目分录]]
- [[Business-Rule-Index]]
