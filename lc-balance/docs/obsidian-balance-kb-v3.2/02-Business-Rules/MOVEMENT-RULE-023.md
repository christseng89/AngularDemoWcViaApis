---
knowledge_id: MOVEMENT-RULE-023
title: "B5 根据输入金额与该 Acceptance 的 Available Balance 之间的关系，推导出 FULL_SETTLE 或 PARTIAL_SETTLE"
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

# MOVEMENT-RULE-023 — B5 根据输入金额与该 Acceptance 的 Available Balance 之间的关系，推导出 FULL_SETTLE 或 PARTIAL_SETTLE

## Status
CONFIRMED

## Business Rule
与 A9 不同，B5 保留了原本『可编辑但有上限』的行为：Maker 可以输入不超过该 Acceptance Available Balance 的任意金额；movementType 在提交时根据输入金额是等于还是小于 Available 来推导得出。

## Conditions
strategy.movementDerivation.amountVsAvailableDerivation === 'SETTLE' 且 model.instrumentType === 'EPLC_ACCEPTANCE'

## Result
amount > available -> 拒绝；amount === available -> FULL_SETTLE；amount < available -> PARTIAL_SETTLE

## Example
available=80000，amount=80000 -> FULL_SETTLE；amount=30000 -> PARTIAL_SETTLE；amount=90000 -> 拒绝

## Verification Note
已直接阅读具体分支代码；与声明内容逐字一致。

## Source Evidence

实现:
- `src/app/transaction-builder/submit-rules.ts:136-148`

测试:
- `submit-rules.spec.ts:342-382`

## Related Knowledge
- [[BalanceMovement]]
- 金额字段锁定优先级链（builder-fields.ts）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
