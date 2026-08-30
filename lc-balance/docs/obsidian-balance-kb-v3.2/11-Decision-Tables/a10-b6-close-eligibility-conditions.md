---
knowledge_id: a10-b6-close-eligibility-conditions
title: "A10/B6 关闭资格条件"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# A10/B6 关闭资格条件

| 条件 | 检查方式 | 失败信息（释义） | 是否阻止关闭？ |
|---|---|---|---|
| 已关闭 | contract.status === 'CLOSED' | 此 LC/保兑已经被关闭。 | 是 |
| 装船保函余额 | sgConfirmedBalance != 0 | 装船保函余额必须为 0（当前为 X）——请先赎回装船保函（A9）。 | 是 |
| 承兑余额 | acceptanceConfirmedBalance != 0 | 承兑余额必须为 0（当前为 X）——请先结清承兑（A7/B5）。 | 是 |
| 整棵事件树中存在未结事件 | hasOpenEvents === true（root/SG/承兑/审单任一处存在 PENDING movement，或仅限出口场景下 RELEASED 但尚未被消耗的审单 CREATE） | 该 LC 下（含子账本）仍有一个或多个事件尚未完全结清。 | 是 |
| 根合约保兑余额（非零） | 任意值 | 此处不检查——这是核销金额，会另行以「精确匹配」方式验证，并非本处的门禁条件 | 否 |

## 来源证据

- `microservices/balance-component/src/domain/closeEligibility.ts lines 21-64`
- `microservices/balance-component/test/unit/domain/closeEligibility.test.ts lines 14-59`

## 相关知识

- [[Close Eligibility|装船保函/承兑赎回、修改减少、关闭资格]]
- [[Business-Rule-Index]]
