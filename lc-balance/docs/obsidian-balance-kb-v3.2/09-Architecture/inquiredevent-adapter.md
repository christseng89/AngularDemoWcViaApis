---
knowledge_id: inquiredevent-adapter
title: "InquiredEvent（适配器模式）"
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

# InquiredEvent（适配器模式）

InquiredEvent 将一笔原始的 BalanceMovement 与其所属的 BalanceContract 配对，并附加三个派生字段：eventTime（用于排序/显示的真正 Event 日期/时间，绝不直接使用 movement.createdAt）、eventStatus（该动账的真实当前状态，绝非冻结的历史值），以及 phase（'primary' | 'create' | 'finalize'）。之所以需要这一层适配，是因为单独一笔动账既不携带 instrumentType 也不携带 naturalKey，而且 A4 是对一笔已存在的 A3/A3S 动账进行终结（finalize），而不是新建一笔动账，因此同一笔动账可以代表两个时间点各自独立的业务事件。

## Source Evidence

- `inquire-events.service.ts:21-41 InquiredEvent interface + doc comment`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
