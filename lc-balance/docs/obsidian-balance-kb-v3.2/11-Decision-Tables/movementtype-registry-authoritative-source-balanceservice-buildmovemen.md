---
knowledge_id: movementtype-registry-authoritative-source-balanceservice-buildmovemen
title: "MovementType 注册表（权威来源：BalanceService.buildMovementTypeRegistry()，镜像至 schema.ts 的 CHECK 约束——而非 types.ts）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# MovementType 注册表（权威来源：BalanceService.buildMovementTypeRegistry()，镜像至 schema.ts 的 CHECK 约束——而非 types.ts）

| 值 | 一句话含义 |
|---|---|
| ISSUE | 创建新合约的初始动作（例如 A1/B1 LC Issue） |
| CREATE | 创建子账（child-ledger）合约（例如首次创建 SHGT/Acceptance/Confirmation） |
| AMEND_INCREASE | 修改，金额增加 |
| AMEND | 修改，充足性检查遵循 'amendShaped' 规则 |
| AMEND_DECREASE | 修改，金额减少 |
| UTILIZE | 使用/动用（例如单据交单、承兑提款） |
| HONOUR | 兑付（付款） |
| ACCEPT | 承兑 |
| PARTIAL_REDEEM | 部分赎回/解除 |
| FULL_REDEEM | 全部赎回/解除 |
| REIMBURSE | 偿付/还款 |
| RECLASSIFY_OUT | 重分类转出（例如转入应收账款科目） |
| PARTIAL_SETTLE | 部分结算 |
| FULL_SETTLE | 全部结算 |
| CLOSE | A10/B6 Close：核销剩余 Confirmed Balance 并将合约标记为 CLOSED（2026-08-21 新增） |

## Source Evidence

- `Balance-Component-DB-Design.txt §5.6 (lines 581-627)`

## Related Knowledge

- DB Design + DB Optimization Analysis Docs
- [[Business-Rule-Index]]
