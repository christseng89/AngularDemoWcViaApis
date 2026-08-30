---
knowledge_id: MOVEMENT-RULE-049
title: "保兑或有负债绝不能仅凭 SWIFT 49 栏位单独产生 — 只能基于实际通知保兑这一操作动作（设计文档规则）"
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

# MOVEMENT-RULE-049 — 保兑或有负债绝不能仅凭 SWIFT 49 栏位单独产生 — 只能基于实际通知保兑这一操作动作（设计文档规则）

## Status
CONFIRMED

## Business Rule
SWIFT 49 栏位仅仅承载开证行的『请求』，并不能说明本行是否实际已经加具保兑；按照源设计文档，保兑或有负债只能基于实际通知保兑这一操作动作而产生，绝不能仅凭 49 栏位的取值来产生。Balance Component 实际的 B1（建立保兑）是由 Maker 发起、需要显式 ISSUE 提交的动作，这与『操作动作』这一说法一致，而不是任何由 49 栏位自动触发的机制——该代码库中根本不存在任何从入账 SWIFT 49 栏位取值推导或有负债的代码路径。

## Conditions
正在评估一笔出口 LC/保兑相关事件是否应产生保兑或有负债

## Result
保兑或有负债只在向受益人实际通知保兑这一操作动作发生时才产生

## Example
49 栏位 = MAY ADD，但保兑被拒绝：不产生任何或有负债

## Verification Note
已逐字确认设计文档原文；与 B1 实际仅由 Maker 发起 ISSUE 触发的机制一致（本代码库中不存在任何 SWIFT 49 栏位摄入逻辑与之矛盾）。

## Source Evidence

Implementation:
- `TF_Contingent_Liability_Lifecycle-en.txt §6`

Tests:
- `TF_Balance_Component_Spec-en.txt §12 T10,T32; I11`

## Related Knowledge
- [[BalanceMovement]]
- Export role determines exposure
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
