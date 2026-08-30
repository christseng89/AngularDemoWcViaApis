---
knowledge_id: tf-mapping-tenor-classification-vs-accounting-driver
title: "TF Mapping ——Tenor 分类对比会计驱动因子"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# TF Mapping ——Tenor 分类对比会计驱动因子

| 方向 | tenorType（UI） | fundingParty/availableWith | Honour 事件 | 会计处理结果 |
|---|---|---|---|---|
| 进口 | SIGHT | — | LC_HONOUR_SIGHT | 应收票据 + 应付结算款 |
| 进口 | BUYERS_USANCE | fundingParty=SELF | LC_HONOUR_BU_A | 进口远期融资（申请人自筹） |
| 进口 | BUYERS_USANCE | fundingParty=REFINANCING_BANK | LC_HONOUR_BU_B | 对申请人的应收款 与 应付再融资银行款，两者并存 |
| 进口 | SELLERS_USANCE | — | LC_ACCEPT | 表内承兑负债 + 应收偿付款 |
| 进口 | （任意） | fundingParty=APPLICANT | 校验阶段即拒绝 | Buyer's usance 的定义就是由买方承担贴现成本——这种组合根本不可能存在 |
| 出口 | SIGHT | availableWith=任意 | CNF_HONOUR_SIGHT | 应收开证行款，无追索权 |
| 出口 | BUYERS_USANCE | availableWith=ISSUING_BANK/ANY_BANK | CNF_HONOUR_BU | 即期应收开证行款——不产生延期应收款 |
| 出口 | BUYERS_USANCE | availableWith=THIS_BANK | CNF_ACCEPT | 到期日应收偿付款（UCP 第 7(c) 条） |
| 出口 | SELLERS_USANCE | availableWith=THIS_BANK | CNF_ACCEPT | 表内承兑负债 + 应收开证行款 |
| 出口 | SELLERS_USANCE | availableWith=ISSUING_BANK | （无事件） | 开证行自身的承兑仅确定到期日，不触发本行事件 |
| 出口 | （任意） | bankRole=NOMINATED，未保兑 | EX_NEGOTIATE | 原本不存在任何或有科目；债务人=出口商 |

## Source Evidence

- `TF_Balance_Component_Mapping-en.txt lines 538-554 (Tenor_Derivation sheet)`

## Related Knowledge

- Balance Figures Calculation Logic + TF Balance Component Mapping Workbook
- [[Business-Rule-Index]]
