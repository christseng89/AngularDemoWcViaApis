---
knowledge_id: amount-field-locking-priority-chain-builder-fields-ts
title: "Amount 字段锁定优先级链（builder-fields.ts）"
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

# Amount 字段锁定优先级链（builder-fields.ts）

buildFields() 会推导出 4 个相互关联的“amount 被锁定”条件（amountFromDocArrival、amountFromFullSettle、amountFromClose、amountFromSgRedeem），共同决定 amountLocked 的取值，并从 6 种互斥的提示文案中选出一种；第 5 个条件（amountCappedAtAcceptance，B5）则刻意让字段保持可编辑，只是设置了一个 `max`。amountFromFullSettle 显式排除了任何 amountVsAvailableDerivation 为 'SETTLE' 的功能（BAL-135 修复），这样 B5 自身用作占位符的字面量 movementType 默认值（'FULL_SETTLE'）就不会被本应只面向 A7 的通用“FULL_SETTLE 锁定 Amount”规则误判捕获。

## Source Evidence

- `src/app/transaction-builder/builder-fields.spec.ts lines 66-184 (Amount field describe block)`
- `src/app/transaction-builder/builder-fields.ts lines 24-102`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
