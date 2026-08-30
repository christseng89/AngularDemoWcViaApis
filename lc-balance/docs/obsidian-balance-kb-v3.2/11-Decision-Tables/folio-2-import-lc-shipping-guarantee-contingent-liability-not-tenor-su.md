---
knowledge_id: folio-2-import-lc-shipping-guarantee-contingent-liability-not-tenor-su
title: "Folio 2 — 进口 LC 提货担保或有负债（不按期限分类）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# Folio 2 — 进口 LC 提货担保或有负债（不按期限分类）

| Lifecycle / Event（生命周期/事件） | Function · MovementType | GL Effect（总账影响） | Debit Account（借方账户） | Credit Account（贷方账户） |
|---|---|---|---|---|
| SG 开立——新开，或金额增加（不存在独立的 AMEND 类型） | A8 · ISSUE | 建立 | Customers' Liability under Shipping Guarantees | Shipping Guarantees Outstanding |
| SG 修改——减额（未实现——Balance Component 中完全没有对应实现） | 不适用 | 释放（−差额） | Shipping Guarantees Outstanding | Customers' Liability under Shipping Guarantees |
| 赎回——全额或部分（取 MIN(Bill Amount, SG Outstanding)；A9 与 A3S 的 SG 分支共享完全相同的逻辑——详见后文关于 A9 后来被锁定为仅支持 Full Redeem 的 CONFLICT 说明） | A9 · FULL_REDEEM / PARTIAL_REDEEM；A3S 自身的 SG 分支 | 释放 | Shipping Guarantees Outstanding | Customers' Liability under Shipping Guarantees |
| 就该 SG 提出索偿（未实现——Balance Component 中完全没有对应实现） | 不适用 | 释放 | Shipping Guarantees Outstanding | Customers' Liability under Shipping Guarantees |

## Source Evidence

- `analysis/contingent-liability-ledger.html #folio-2`

## Related Knowledge

- Contingent Liability Ledger (Dr/Cr Reference)
- [[Business-Rule-Index]]
