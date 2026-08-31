---
knowledge_id: movement-direction-lookup-table
title: "MOVEMENT_DIRECTION 查找表"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# MOVEMENT_DIRECTION 查找表

balanceDerivation.ts 中的一个常量 Record<string, 1|-1>，将每个 movementType 映射为一个带符号方向，用于在余额上限（ceiling）层面计算余额。增加形态的 movementType（ISSUE、AMEND_INCREASE、CREATE、AMEND）映射为 +1；减少形态的 movementType（AMEND_DECREASE、UTILIZE、PARTIAL_SETTLE、FULL_SETTLE、PARTIAL_REDEEM、FULL_REDEEM、HONOUR、ACCEPT、REIMBURSE、RECLASSIFY_OUT、CLOSE）映射为 -1。源代码注释说明，该表仅覆盖原型系统 Case 1-5 测试向量所实际使用到的 movementType，明确排除了 CANCEL/EXPIRE/REVERSAL，并警告 REVERSAL 需要特殊处理（应取原始分录的符号，而非固定方向）之后才能被纳入该表。

## 来源证据

- `microservices/balance-component/src/domain/balanceDerivation.ts lines 1-49 (MOVEMENT_DIRECTION const and its doc comment)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
</content>
