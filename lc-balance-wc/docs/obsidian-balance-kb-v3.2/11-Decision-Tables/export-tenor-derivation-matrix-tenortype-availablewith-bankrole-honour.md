---
knowledge_id: export-tenor-derivation-matrix-tenortype-availablewith-bankrole-honour
title: "出口期限推导矩阵——tenorType/availableWith/bankRole → 兑付事件与偿付时点"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 出口期限推导矩阵——tenorType/availableWith/bankRole → 兑付事件与偿付时点

| tenorType | availableWith | bankRole | Honour event（兑付事件） | Reimbursement due（偿付到期时点） |
|---|---|---|---|---|
| SIGHT | 任意 | CONFIRMING | CNF_HONOUR_SIGHT | 即期 |
| BUYERS_USANCE | ISSUING_BANK / ANY_BANK（即期付款或议付方式） | CONFIRMING | CNF_HONOUR_BU | 即期——不形成延期应收款 |
| BUYERS_USANCE | THIS_BANK，承兑/延期付款方式 | CONFIRMING | CNF_ACCEPT | 到期日，Art. 7(c) |
| SELLERS_USANCE | THIS_BANK | CONFIRMING | CNF_ACCEPT | 到期日，Art. 7(c) |
| SELLERS_USANCE | ISSUING_BANK | CONFIRMING | 无事件 | 开证行自身的承兑行为仅确定到期日 |
| 任意 | 任意 | NOMINATED（未保兑） | EX_NEGOTIATE | 不适用——义务人为出口商 |
| 任意 | 任意 | ADVISING | 无 | 无或有负债，也不产生资产 |

## Source Evidence

- `TF_Balance_Component_Spec-en.txt §4.2`

## Related Knowledge

- Foundational Design-Rationale Docs (TF Balance Spec + Contingent Liability Lifecycle)
- [[Business-Rule-Index]]
