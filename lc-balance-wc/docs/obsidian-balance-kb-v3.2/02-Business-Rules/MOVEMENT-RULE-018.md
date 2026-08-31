---
knowledge_id: MOVEMENT-RULE-018
title: "功能按钮（Function-chip）的操作图标按领域语义分组，而非按原始 movementType 字符串"
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

# MOVEMENT-RULE-018 — 功能按钮（Function-chip）的操作图标按领域语义分组，而非按原始 movementType 字符串

## Status
CONFIRMED

## Business Rule
16 个具名业务功能（A1-A10/B1-B6）中的每一个，都会被分配到反映其底层领域语义的 5 种操作类型图标之一，而非直接按原始 movementType 字符串分配。issue（开立）：A1、A6、A8、B1。amend（修改）：A2、B2。utilize（使用）：A3、A3S、A4、B3、B4。cross（叉号，用于核销/终止）：A10、B6（此处刻意不使用形似对勾的 'redeem' 分组，因为那会让人误读为『已结清/已批准』，而这实际上是不可逆的终止操作）。redeem（赎回）：其余所有功能（A7、A9、B5）以及任何无法识别的代码（作为兜底的防御性默认值）。

## Conditions
按 ISSUE_GROUP_CODES/AMEND_GROUP_CODES/UTILIZE_GROUP_CODES/CLOSE_GROUP_CODES 的顺序依次查找功能代码，若都不匹配则落回 redeem

## Result
functionActionIcon('A10') -> 'cross'；functionActionIcon('NOPE') -> 'redeem'（兜底）

## Example
参见源码第 582-588 行

## Verification Note
已直接阅读函数实现；与声明内容完全一致，包括检查顺序（CLOSE 先于落回 redeem 之前被检查）。

## Source Evidence

实现:
- `src/app/transaction-builder/balance-component.model.ts:582-588`

测试:
- `balance-component.model.spec.ts:781-809`

## Related Knowledge
- [[BalanceMovement]]
- [[functionactionicon|functionActionIcon()]]
- [[statusbadgeicon|statusBadgeIcon()]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
