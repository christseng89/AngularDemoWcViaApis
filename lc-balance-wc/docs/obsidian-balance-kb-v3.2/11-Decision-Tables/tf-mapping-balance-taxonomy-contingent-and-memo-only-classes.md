---
knowledge_id: tf-mapping-balance-taxonomy-contingent-and-memo-only-classes
title: "TF Mapping ——余额分类：Contingent 与 Memo-Only 类别"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# TF Mapping ——余额分类：Contingent 与 Memo-Only 类别

| balance_class | balance_type（示例） | natural_side | presentation_rule | 备注 |
|---|---|---|---|---|
| CONTINGENT | LC_CUSTOMER_LIABILITY | Dr | FIXED | 银行对申请人的追索权——并非表内负债 |
| CONTINGENT | LC_OUTSTANDING | Cr | FIXED | 银行对受益人的承付责任 |
| CONTINGENT | SG_CUSTOMER_LIABILITY / SG_OUTSTANDING | Dr / Cr | FIXED | 对承运人的保函/赔偿责任 |
| CONTINGENT | CONFIRMATION_EXPOSURE / CONFIRMATION_OUTSTANDING | Dr / Cr | FIXED | 债务人为开证行，而非出口商；以 confirmed_amount 为驱动依据，而非 lc_amount |
| CONTINGENT | REIMB_UNDERTAKING_EXPOSURE / OUTSTANDING | Dr / Cr | FIXED | 仅在出具了偿付承诺（URR 725）时才成立；单纯的代理性偿付不产生任何科目 |
| CONTINGENT | AWB_CUSTOMER_LIABILITY / AWB_OUTSTANDING | Dr / Cr | FIXED | 空运放货——与 SG 属于不同产品，无需返还物权单据 |
| ON_BALANCE_LIABILITY | ACCEPTANCE_DPU_OUTSTANDING | Cr | NET_IF_ELIGIBLE | 真正的表内会计负债——而非或有事项 |
| ON_BALANCE_LIABILITY | CONFIRMED_ACCEPTANCE_DPU_OUTSTANDING | Cr | NET_IF_ELIGIBLE | 仅当 available_with = THIS_BANK 时适用 |
| MEMO_ONLY | ACCEPTANCE_SHADOW_DR / _CR | Dr / Cr | FIXED | 仅供 MIS 使用——绝不进入财务报表（I6） |
| MEMO_ONLY | CONFIRMED_ACCEPTANCE_SHADOW_DR / _CR | Dr / Cr | FIXED | 仅供 MIS 使用 |
| MEMO_ONLY | DOCUMENT_UNDER_EXAMINATION（+ CONTRA） | Dr / Cr | FIXED | 用于呈现 UCP 第 16 条审单时钟；按 I1C 配对 |
| MEMO_ONLY | EXPORT_BILLS_UNDER_EXAMINATION（+ CONTRA） | Dr / Cr | FIXED | 出口侧的对应科目，按 I1C 配对 |

## Source Evidence

- `TF_Balance_Component_Mapping-en.txt lines 76-130 (Balance_Taxonomy)`

## Related Knowledge

- Balance Figures Calculation Logic + TF Balance Component Mapping Workbook
- [[Business-Rule-Index]]
