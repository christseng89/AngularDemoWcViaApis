---
knowledge_id: business-case-registry-all-23-cases-id-side-instrument-tenor-focus-ter
title: "业务用例登记表——全部 23 个用例（编号、买卖方向、金融工具／期限焦点、终态事件、核心机制）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 业务用例登记表——全部 23 个用例（编号、买卖方向、金融工具／期限焦点、终态事件、核心机制）

| 用例编号 | 买卖方向 | 金融工具／期限 | 终态事件 | 展示的核心机制 |
|---|---|---|---|---|
| import-case-1 | 进口 | IPLC_LC，即期 | A4 结算（承付） | A4 真实的 Maker 提交门禁（仅限即期） |
| import-case-2 | 进口 | IPLC_LC + IPLC_ACCEPTANCE，买方远期 120 天 | 承兑 FULL_SETTLE | LC 负债 -> 承兑负债的切分；parentLogicalContractIdRef 解析 |
| import-case-3 | 进口 | IPLC_LC + SHGT，即期 | SG FULL_REDEEM | SG 金额与单据精确匹配；A4 门禁；EBL/IBL 仅作备忘 |
| import-case-4 | 进口 | IPLC_LC + SHGT，即期 | A4 结算 | A3S 按 businessEventId 匹配轧差（部分 SG 匹配） |
| import-case-5 | 进口 | IPLC_LC，即期 | AMEND_DECREASE 被拒绝 | 面额减少至负值被硬性拒绝（expectError） |
| import-case-6 | 进口 | IPLC_LC + 2 笔 SHGT，即期 | 3 次 A4 结算 | 两组 A3S 配对（全额+部分赎回）加一笔普通 A3；转录自真实 S01 数据 |
| import-case-7 | 进口 | IPLC_LC + SHGT + 2 笔 IPLC_ACCEPTANCE，卖方远期 120 天 | 2 次承兑 FULL_SETTLE | A6 复合放行（先单据到达，后承兑 CREATE）；转录自真实 U01 数据 |
| import-case-8 | 进口 | IPLC_LC + SHGT + 2 笔 IPLC_ACCEPTANCE，卖方远期 | A10 关闭 | 延续用例 7 的路径直至关闭 |
| import-case-9 | 进口 | IPLC_LC + IPLC_ACCEPTANCE，买方远期 | A10 关闭 | 延续用例 2 的路径直至关闭；SG 条件平凡满足（从未开立） |
| import-case-10 | 进口 | IPLC_LC + SHGT，即期 | A10 关闭 | 独立（未匹配）的 A9 SG 赎回与 A4 结算，均推进至终态 |
| import-case-11 | 进口 | IPLC_LC + SHGT，即期 | A10 关闭被拒绝 | 反向用例：SG 余额 != 0 阻止关闭（expectError） |
| import-case-12 | 进口 | IPLC_LC + IPLC_ACCEPTANCE，卖方远期 | A10 关闭被拒绝 | 反向用例：承兑余额 != 0 阻止关闭（expectError） |
| export-case-1 | 出口 | EPLC_CONFIRMATION，即期 | 开证行承付 | 旧版（B3/B4 重新设计之前）的直接 HONOUR 形态 |
| export-case-2 | 出口 | EPLC_CONFIRMATION + EPLC_ACCEPTANCE，卖方远期，已保兑，无 EBL | 承兑 FULL_SETTLE | 旧版直接 ACCEPT；保兑负债 -> 承兑负债的转换 |
| export-case-3 | 出口 | EPLC_CONFIRMATION + EPLC_ACCEPTANCE，卖方远期，已保兑 + EBL | 承兑 FULL_SETTLE | 与用例 2 相同，另加 EBL 备忘性融资，不重复计入 |
| export-case-4 | 出口 | EPLC_LC（仅引用）+ EPLC_ACCEPTANCE，未保兑，无 EBL | 承兑 FULL_SETTLE | exposureNature=MEMO，自始至终不存在保兑负债 |
| export-case-5 | 出口 | EPLC_LC（仅引用）+ EPLC_ACCEPTANCE，未保兑 + EBL | 承兑 FULL_SETTLE | 与用例 4 相同，另加 EBL 备忘性融资，仍不存在保兑负债 |
| export-case-6 | 出口 | EPLC_CONFIRMATION + EPLC_EXAMINATION + EPLC_DUE_FROM_ISSUING_BANK，即期 | B4 承付复合放行 | 当前 B3（真实放行）->B4（统一、与关联资产端复合）的架构；转录自真实 S01 数据 |
| export-case-7 | 出口 | EPLC_CONFIRMATION + EPLC_EXAMINATION + EPLC_ACCEPTANCE + EPLC_ACCEPTANCE_REIMB_RECEIVABLE，卖方远期 | B5 复合结算 | B4 复合创建承兑+偿付应收；B5 复合放行两者；转录自真实 U01 数据 |
| export-case-8 | 出口 | EPLC_CONFIRMATION + EPLC_EXAMINATION + EPLC_DUE_FROM_ISSUING_BANK，即期 | B6 关闭 | 延续用例 6 的路径直至关闭 |
| export-case-9 | 出口 | EPLC_CONFIRMATION + EPLC_EXAMINATION + EPLC_ACCEPTANCE + EPLC_ACCEPTANCE_REIMB_RECEIVABLE，卖方远期 | B6 关闭 | 延续用例 7 的路径直至关闭 |
| export-case-10 | 出口 | EPLC_CONFIRMATION，即期 | AMEND 被拒绝 | 独立的 B2 基于符号的方向判定；超出紧口径可用余额的反向 AMEND 被拒绝（expectError） |
| export-case-11 | 出口 | EPLC_CONFIRMATION + EPLC_ACCEPTANCE，卖方远期 | B6 关闭被拒绝 | 反向用例：承兑余额 != 0 阻止关闭（expectError） |

## 来源证据

- `backend/data/businessCases.js:2414-2441`
- `backend/test/businessCases.test.js:8-32,55-84`

## 相关知识

- Business Case Registry (backend orchestrator) + Business Case Runner UI
- [[Business-Rule-Index]]
