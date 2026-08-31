---
knowledge_id: folio-1-import-lc-contingent-liability-customers-liability-under-dc-do
title: "Folio 1 — 进口 LC 或有负债（Customers' Liability under DC / Documentary Credits Outstanding）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# Folio 1 — 进口 LC 或有负债（Customers' Liability under DC / Documentary Credits Outstanding）

| Tenor Type（期限类型） | Lifecycle / Event（生命周期/事件） | Function · MovementType | GL Effect（总账影响） | Debit Account（借方账户） | Credit Account（贷方账户） |
|---|---|---|---|---|---|
| 即期 / 买方远期 / 卖方远期 | LC 开立 | A1 · ISSUE | 建立 | Customers' Liability under DC — [Tenor] | Documentary Credits Outstanding — [Tenor] |
| 即期 / 买方远期 / 卖方远期 | 修改——增额 | A2 · AMEND_INCREASE | 建立（+差额） | Customers' Liability under DC — [Tenor] | Documentary Credits Outstanding — [Tenor] |
| 即期 / 买方远期 / 卖方远期 | 修改——减额（未实现同意闸门校验） | A2 · AMEND_DECREASE | 释放（−差额） | Documentary Credits Outstanding — [Tenor] | Customers' Liability under DC — [Tenor] |
| 即期 / 买方远期 / 卖方远期 | 单据到达（Utilize 之前） | A3 / A3S · Utilize 之前 | 不影响总账（仅备忘） | Bills under LC — Received, Under Examination（备忘） | Bills under LC — Contra（备忘） |
| 即期 / 买方远期 / 卖方远期 | 兑付（Sight：A3/A3S→A4；BU/SU：A3→A6） | UTILIZE | 释放 | Documentary Credits Outstanding — [Tenor] | Customers' Liability under DC — [Tenor] |
| 即期 / 买方远期 / 卖方远期 | 到期失效/撤销（未实现——不存在 EXPIRE/CANCEL 这类 movementType） | 不适用 | 释放（余额） | Documentary Credits Outstanding — [Tenor] | Customers' Liability under DC — [Tenor] |

## Source Evidence

- `analysis/contingent-liability-ledger.html #folio-1`

## Related Knowledge

- Contingent Liability Ledger (Dr/Cr Reference)
- [[Business-Rule-Index]]
