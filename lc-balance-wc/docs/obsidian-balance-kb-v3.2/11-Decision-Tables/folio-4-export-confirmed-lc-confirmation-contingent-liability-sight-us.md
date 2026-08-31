---
knowledge_id: folio-4-export-confirmed-lc-confirmation-contingent-liability-sight-us
title: "Folio 4 — 出口保兑 LC 保兑或有负债（仅即期/远期——由 Sight/BU/SU 归并而来）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# Folio 4 — 出口保兑 LC 保兑或有负债（仅即期/远期——由 Sight/BU/SU 归并而来）

| Tenor Type（期限类型） | Lifecycle / Event（生命周期/事件） | Function · MovementType | GL Effect（总账影响） | Debit Account（借方账户） | Credit Account（贷方账户） |
|---|---|---|---|---|---|
| 即期 / 远期 | 保兑 LC | B1 · ISSUE | 建立 | Issuing Bank Confirmation Exposure — [Tenor] | Confirmation Undertakings Outstanding — [Tenor] |
| 即期 / 远期 | 保兑 LC 修改——增额 | B2 · AMEND（带符号 +差额） | 建立（+差额） | Issuing Bank Confirmation Exposure — [Tenor] | Confirmation Undertakings Outstanding — [Tenor] |
| 即期 / 远期 | 保兑 LC 修改——减额 | B2 · AMEND（带符号 −差额） | 释放（−差额） | Confirmation Undertakings Outstanding — [Tenor] | Issuing Bank Confirmation Exposure — [Tenor] |
| 即期 / 远期 | 收到交单 | B3 · CREATE (EPLC_EXAMINATION) | 不影响总账（仅备忘） | Export Bills — Received, Under Examination（备忘） | Export Bills — Contra（备忘） |
| 即期 / 远期 | 兑付（即期）/ 承兑（远期） | 即期：B3→B4 · HONOUR；远期：B3→B4 · ACCEPT | 释放 | Confirmation Undertakings Outstanding — [Tenor] | Issuing Bank Confirmation Exposure — [Tenor] |
| 即期 / 远期 | 保兑到期失效（未实现——不存在 EXPIRE 这类 movementType） | 不适用 | 释放（余额） | Confirmation Undertakings Outstanding — [Tenor] | Issuing Bank Confirmation Exposure — [Tenor] |

## Source Evidence

- `analysis/contingent-liability-ledger.html #folio-4`

## Related Knowledge

- Contingent Liability Ledger (Dr/Cr Reference)
- [[Business-Rule-Index]]
