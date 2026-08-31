---
knowledge_id: MOVEMENT-RULE-031
title: "eventStatus 在 InquiredEvent 每一个阶段的每一行上，始终反映 movement 真实的当前状态，绝不是被冻结的历史值"
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

# MOVEMENT-RULE-031 — eventStatus 在 InquiredEvent 每一个阶段的每一行上，始终反映 movement 真实的当前状态，绝不是被冻结的历史值

## Status
CONFIRMED

## Business Rule
toEventRows() 会在其产生的每一行上无条件地将 eventStatus 设置为 movement.status，包括拆分出的一对行中的『创建』行——此前上线的版本曾存在反向的错误（『创建』行错误地将 eventStatus 冻结为 'PENDING'），现已修复。另外独立冻结的 Balance Snapshot 标签页（finalizeEventSnapshot 等）是一个不同的、刻意冻结的概念，不受此影响。

## Conditions
任意 InquiredEvent 行，任意阶段

## Result
读取时 eventStatus 始终等于 movement.status

## Example
一个已 RELEASED 的 UTILIZE，其『创建』行显示的 eventStatus 为 RELEASED，而非其在 A3 提交时所处的历史状态 PENDING

## Verification Note
已直接阅读具体源码行；两行均如声明所述，无条件读取 movement.status。

## Source Evidence

实现:
- `src/app/transaction-builder/inquire-events.service.ts:90,93-94`

测试:
- `inquire-events.service.spec.ts:180`

## Related Knowledge
- [[BalanceMovement]]
- toEventRows()——创建/终结行拆分
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
