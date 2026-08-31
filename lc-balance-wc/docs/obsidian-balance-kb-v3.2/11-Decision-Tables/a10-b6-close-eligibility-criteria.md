---
knowledge_id: a10-b6-close-eligibility-criteria
title: "A10/B6 关闭——资格判定标准"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# A10/B6 关闭——资格判定标准

| 判定标准 | 要求 |
|---|---|
| 金融工具范围 | 仅限根级 IPLC_LC/EPLC_LC/EPLC_CONFIRMATION——其他任何 instrumentType 均返回 400 |
| 合约状态 | 尚未处于 CLOSED |
| 装船保函风险敞口 | 装船保函保兑余额 = 0 |
| 承兑风险敞口 | 承兑保兑余额 = 0 |
| 未结事件 | 整棵事件树中（root 及每一个 SG/承兑/审单子节点）均不存在未结事件——仍处于 PENDING 的 movement，或已 RELEASED 但尚未被消耗的 EPLC_EXAMINATION CREATE，两者都会阻止满足资格 |
| 金额 | 必须与提交（Submit）时合约当前的保兑余额精确相等（可以为零，但不可为负）；在放行（Release）时会逐字节重新核对、要求分毫不差 |
| 复核时机 | 同一条资格规则会在 POST /balance-movements（提交，409 INSUFFICIENT_AVAILABLE_BALANCE）与 POST .../release（放行，409 ILLEGAL_STATE_TRANSITION）两处分别评估 |

## 来源证据

- `balance-component-api.yaml lines 456-488, 616-666, 805-813, 953-959`

## 相关知识

- OpenAPI Specs — Microservice + Channel API
- [[Business-Rule-Index]]
