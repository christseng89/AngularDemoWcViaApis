---
knowledge_id: balancemovement-persisted-snapshot-fields-applicability
title: "BalanceMovement 持久化快照字段——适用性"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# BalanceMovement 持久化快照字段——适用性

| 字段 | 何时被填充 | 备注 |
|---|---|---|
| eventSnapshot | 每一笔 movement | Create 时为 PENDING 状态，Release 时被覆写为 RELEASED——但即期（Sight）IPLC_LC UTILIZE 的 finalize 例外，此字段保持冻结（不变） |
| rootEventSnapshot | 仅限子账本 movement（SHGT、IPLC_ACCEPTANCE、EPLC_ACCEPTANCE、EPLC_EXAMINATION） | 同一时刻父级 LC/保兑自身的普通余额；根级 movement 上此字段为 null |
| acceptanceEventSnapshot | 根级 movement，且根合约下恰好存在唯一一笔承兑同级合约 | 当同级承兑合约为 0 个或 ≥2 个时为 null；若该 movement 自身所属合约本身就是承兑合约，同样为 null |
| sgEventSnapshot | 根级 movement，且根合约下恰好存在唯一一笔装船保函（SHGT）同级合约 | 仅限进口方向（出口方向没有对应字段） |
| finalizeEventSnapshot | 仅当 release() 对即期（Sight）期限的 IPLC_LC UTILIZE 执行 finalize 时 | 记录放行时刻的数值；对于这一特殊场景，eventSnapshot 本身仍冻结在创建时刻 |
| finalizeAcceptanceEventSnapshot / finalizeSgEventSnapshot | 仅限同一种即期 IPLC_LC UTILIZE 的 finalize 场景 | 分别对应 acceptanceEventSnapshot/sgEventSnapshot 在放行时刻的版本，而后者自身仍保持冻结 |

## 来源证据

- `balance-component-api.yaml lines 292-355, 1484-1553`

## 相关知识

- OpenAPI Specs — Microservice + Channel API
- [[Business-Rule-Index]]
