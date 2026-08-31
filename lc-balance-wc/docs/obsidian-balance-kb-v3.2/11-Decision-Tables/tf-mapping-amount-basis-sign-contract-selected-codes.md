---
knowledge_id: tf-mapping-amount-basis-sign-contract-selected-codes
title: "TF Mapping ——Amount_Basis 正负号约定（精选代码）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# TF Mapping ——Amount_Basis 正负号约定（精选代码）

| amount_basis_code | 解析方式 | sign_contract | 备注 |
|---|---|---|---|
| DOCUMENT_AMOUNT | event.amount | NON_NEGATIVE | 最常用的基准——已交单/相符单据的金额 |
| AMENDMENT_DELTA | ABS(event.delta_amount) | NON_NEGATIVE | 仅取绝对值（I22）——方向一律来自 movement，绝不取自正负号本身 |
| CONFIRMED_AMOUNT | undertaking.confirmed_amount | NON_NEGATIVE | 独立于 lc_amount（I13） |
| SG_FULL_OUTSTANDING | 事件发生时点的 balance(SG_OUTSTANDING) | NON_NEGATIVE | 全额——绝不取 MIN(单据金额, SG 金额) |
| CLAIM_AMOUNT | event.amount | NON_NEGATIVE | 若 SG 形式为无限额，索赔金额可能超过已入账的名义金额 |
| ECL_DELTA | ECL_AMOUNT(现值) − balance(PROVISION_OFFBS) | SIGNED | 重新评估可能表现为释放——与 movement=DERIVED_FROM_SIGN 配对 |
| FX_REVAL_DELTA | (收盘汇率 − 入账汇率) × 货币余额 | SIGNED | 双向皆可变动；由结构本身保证或有科目配对的损益为零 |
| ORIGINAL_AMOUNT_SIGNED | reversed_event.amount × −1 | SIGNED | 仅用于 MIRROR 行；具体腿/方向在运行时依据 reversal_of 解析 |
| ZERO | 0 | 不适用 | 不产生过账的事件，须明确声明，绝不可从缺失中推断（I17） |

## Source Evidence

- `TF_Balance_Component_Mapping-en.txt lines 414-449 (Amount_Basis sheet)`

## Related Knowledge

- Balance Figures Calculation Logic + TF Balance Component Mapping Workbook
- [[Business-Rule-Index]]
