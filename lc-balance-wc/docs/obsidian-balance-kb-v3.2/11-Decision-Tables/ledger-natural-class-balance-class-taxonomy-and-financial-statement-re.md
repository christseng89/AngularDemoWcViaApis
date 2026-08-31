---
knowledge_id: ledger-natural-class-balance-class-taxonomy-and-financial-statement-re
title: "ledger_natural_class（balance_class）分类体系与财务报表触达范围"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# ledger_natural_class（balance_class）分类体系与财务报表触达范围

| balance_class | Meaning（含义） | Reaches financial statements?（是否触达财务报表） |
|---|---|---|
| CONTINGENT | 表外备忘项目；需披露，但从不列示于资产负债表正表 | 仅作披露，从不列示于正表 |
| ON_BALANCE_ASSET | 计入资产负债表 | 是 |
| ON_BALANCE_ASSET_CONTRA | 与指定资产科目对冲（例如未实现折价） | 是，作为抵减科目 |
| ON_BALANCE_LIABILITY | 计入资产负债表 | 是 |
| PROFIT_AND_LOSS | 计入损益表 | 是 |
| MEMO_ONLY | 仅供操作/管理信息用途 | 从不——不变量 I6 |

## Source Evidence

- `TF_Balance_Component_Spec-en.txt §2.1, §2.6`

## Related Knowledge

- Foundational Design-Rationale Docs (TF Balance Spec + Contingent Liability Lifecycle)
- [[Business-Rule-Index]]
