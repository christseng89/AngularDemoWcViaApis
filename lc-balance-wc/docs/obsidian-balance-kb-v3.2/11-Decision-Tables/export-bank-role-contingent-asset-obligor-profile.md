---
knowledge_id: export-bank-role-contingent-asset-obligor-profile
title: "出口场景 bank_role → 或有负债/资产/义务人画像"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 出口场景 bank_role → 或有负债/资产/义务人画像

| Role（角色） | Contingent liability?（是否构成或有负债） | Asset on honour（承兑/兑付后形成的资产） | Obligor（义务人） |
|---|---|---|---|
| Advising bank（通知行，Art. 9） | 无——Art. 9(b) 项下职责：核验表面真实性 + 准确转递通知 + 通知义务（Art. 9(f)） | 无 | — |
| Nominated bank, not acting（被指定但未实际行使职能的银行） | 无 | 无 | — |
| Nominated bank, negotiating（未保兑议付行） | 无 | 对出口商有追索权的预付款（advance with recourse） | 出口商 |
| Confirming bank（实际已加具保兑的保兑行） | 是——独立承诺 | 对开证行/偿付行无追索权的索偿权（claim without recourse） | 开证行 + 所在国家 |
| Silent confirmer（暗示保兑行） | 是——但仅为与出口商之间的双边约定 | 对开证行的索偿权，法律路径较弱 | 开证行 + 所在国家，违约损失率（LGD）更高 |
| Reimbursing bank（偿付行，URR 725） | 若已开立偿付承诺函则为是 | 对开证行的索偿权 | 开证行 |

## Source Evidence

- `TF_Contingent_Liability_Lifecycle-en.txt §6`

## Related Knowledge

- Foundational Design-Rationale Docs (TF Balance Spec + Contingent Liability Lifecycle)
- [[Business-Rule-Index]]
