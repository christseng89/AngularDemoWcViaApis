---
knowledge_id: MOVEMENT-RULE-059
title: "B2 保兑信用证修改采用单一带正负号增减额的 AMEND 类型，而非分开的增加/减少 movementType —— Folio 4 借贷方处理"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - movement
  - confirmed
---

# MOVEMENT-RULE-059 — B2 保兑信用证修改采用单一带正负号增减额的 AMEND 类型，而非分开的增加/减少 movementType —— Folio 4 借贷方处理

## 状态
CONFIRMED

## 业务规则
与进口侧分开的 AMEND_INCREASE/AMEND_DECREASE movementType（A2）不同，出口侧的 B2 使用单一固定的 AMEND movementType，携带一个带正负号的增减额。无论增加还是减少方向，都过账至完全相同的 Folio-4 账户对，只是在减少的情形下借贷方互换，与 Folio 1 自身 A2 的处理方式一致。

## 触发条件
Function = B2，任一方向

## 结果
增加：借记发证行保兑风险敞口 / 贷记保兑承诺未偿余额；减少：过账为同一账户对的完全反向分录

## 示例
一笔带负数带正负号金额的 B2 修改，所过账的分录恰好是 B1 自身建立分录的镜像

## 验证说明
本轮已直接阅读了准确的 Implementation Notes 段落原文；与所述内容逐字相符。

## 来源证据

实现:
- `analysis/contingent-liability-ledger.html — Implementation Notes, 'Confirm LC Amendment has no direction sub-choice' paragraph`

测试:
- （未引用直接测试证据）

## 相关知识
- [[BalanceMovement]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
