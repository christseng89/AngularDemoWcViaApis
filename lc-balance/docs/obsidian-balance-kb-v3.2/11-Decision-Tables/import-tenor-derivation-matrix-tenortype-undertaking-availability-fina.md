---
knowledge_id: import-tenor-derivation-matrix-tenortype-undertaking-availability-fina
title: "进口期限推导矩阵——tenorType → undertaking_availability/financing_structure/funding_party → 兑付事件"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 进口期限推导矩阵——tenorType → undertaking_availability/financing_structure/funding_party → 兑付事件

| tenorType | undertakingAvailability | financingStructure | fundingParty | Honour event（兑付事件） | Result（结果） |
|---|---|---|---|---|---|
| SIGHT | SIGHT | NONE | — | LC_HONOUR_SIGHT | 应收票据 + 结算应付款 |
| BUYERS_USANCE | SIGHT | BUYER_USANCE | SELF | LC_HONOUR_BU_A | 进口远期融资（申请人） |
| BUYERS_USANCE | SIGHT | BUYER_USANCE | REFINANCING_BANK | LC_HONOUR_BU_B | 申请人应收款 与 应付再融资行款项（两者均计毛额） |
| SELLERS_USANCE | ACCEPTANCE | SELLER_USANCE | — | LC_ACCEPT | 表内承兑负债 + 偿付应收款 |
| SELLERS_USANCE | DEF_PAYMENT | SELLER_USANCE | — | LC_ACCEPT | 同上；instrumentType = DPU |

## Source Evidence

- `TF_Contingent_Liability_Lifecycle-en.txt §2.4, §3.6`
- `TF_Balance_Component_Spec-en.txt §4.1`

## Related Knowledge

- Foundational Design-Rationale Docs (TF Balance Spec + Contingent Liability Lifecycle)
- [[Business-Rule-Index]]
