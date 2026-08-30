---
knowledge_id: compound-shape-secondary-fields-populated-on-success-vs-on-each-failur
title: "复合形态——成功时填充的次要字段 与 各失败点的处理"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 复合形态——成功时填充的次要字段 与 各失败点的处理

| 形态 | 分录顺序 | 全部成功时填充的次要字段 | 主分录失败时的结果 | 次／第三分录失败时的结果 |
|---|---|---|---|---|
| A3S | SG 赎回 → LC UTILIZE | arrivalSgRedeemMovementId, arrivalSgRedeemMovement | 无（SG 赎回本身失败——未创建任何记录） | 不适用——LC UTILIZE 失败会转而触发 SG 分录的自动回滚（详见 MAKER-CHECKER-RULE） |
| B4 HONOUR | 承付 → 开证行应收 CREATE | dueFromIssuingBankMovementId | 无 | 保留承付自身的结果 |
| B4 ACCEPT | 承兑 → 承兑 CREATE → 应收 CREATE | acceptanceMovementId, acceptanceMovement, acceptanceReimbReceivableMovementId | 无 | 保留承兑自身的结果；次要字段携带后两个分录中已成功的那一个 |
| B5 | 结算 → resolveContract(应收) → REIMBURSE | matchedReceivableMovementId | 无 | 保留结算自身的结果（无论是 resolveContract 还是 REIMBURSE 失败） |
| 普通 | 单一 createMovement | 无（恒为 {}） | 无 | 不适用（只有一个分录） |

## 来源证据

- `maker-submit.service.ts:88-330`

## 相关知识

- Angular Maker Panel + Submit Orchestration
- [[Business-Rule-Index]]
