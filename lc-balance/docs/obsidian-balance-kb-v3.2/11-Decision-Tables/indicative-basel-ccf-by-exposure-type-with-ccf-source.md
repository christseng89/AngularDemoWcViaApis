---
knowledge_id: indicative-basel-ccf-by-exposure-type-with-ccf-source
title: "指示性巴塞尔信用转换系数（CCF）按风险敞口类型划分，附 ccf_source"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 指示性巴塞尔信用转换系数（CCF）按风险敞口类型划分，附 ccf_source

| Exposure（风险敞口） | CCF | ccf_source | Basel classification（巴塞尔分类） |
|---|---|---|---|
| 跟单信用证，短期自偿性，以货物为抵押 | 20% | REGULATORY | 贸易相关或有项目 |
| 出口 LC 保兑，短期自偿性 | 20% | REGULATORY | 贸易相关或有项目（义务人 = 开证行） |
| 银行承兑汇票 / 已发生的 DPU | 不适用——属表内项目 | — | 根本不属于表外项目；应按已放款债权计提风险权重 |
| 提货担保 / 提货单背书 | 100% | INTERNAL_POLICY | 直接信用替代——CRE20 未明确命名此项 |
| 已开立 SG 的 LC——已覆盖部分 | 100% | INTERNAL_POLICY | 货物放行后经论证重新加权；需与监管机构协商一致 |
| 备用信用证，金融性质 | 100% | REGULATORY | 直接信用替代 |
| 备用信用证 / 保函，履约性质 | 50% | REGULATORY | 履约相关或有项目 |
| 偿付承诺（URR 725） | 100%，待监管确认 | INTERNAL_POLICY | 未以货运为抵押——不满足 20% 的前提条件 |
| 已通知承诺，其他类型 | 40% | REGULATORY | 承诺 |
| 已通知承诺，可无条件撤销 | 10% | REGULATORY | 巴塞尔 III 由 0% 上调（已被取代） |
| 未通知额度 | — | — | 依 CRE20 不构成"承诺"——不计提任何权重 |

## Source Evidence

- `TF_Contingent_Liability_Lifecycle-en.txt §10.3`

## Related Knowledge

- Foundational Design-Rationale Docs (TF Balance Spec + Contingent Liability Lifecycle)
- [[Business-Rule-Index]]
