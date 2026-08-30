---
knowledge_id: MOVEMENT-RULE-030
title: "已终结的 Sight 期限单据到达（Document Arrival），在合并后的 Inquire Events 时间线上会拆分为一条『创建』行与一条『终结』行"
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

# MOVEMENT-RULE-030 — 已终结的 Sight 期限单据到达（Document Arrival），在合并后的 Inquire Events 时间线上会拆分为一条『创建』行与一条『终结』行

## Status
CONFIRMED

## Business Rule
当且仅当满足以下全部条件时，一个 movement 会被拆分为恰好两条 InquiredEvent 行：contract.instrumentType === 'IPLC_LC' 且 movement.movementType === 'UTILIZE' 且 contract.tenorType === 'SIGHT' 且 movement.status !== 'PENDING' 且 movement.releasedAt 已设置。『创建』行（eventTime = createdAt）代表 A3 最初的提交；『终结』行（eventTime = releasedAt）代表 A4 真正的 Sight Settlement release。其余所有 movement 都只产生一条『主』行。

## Conditions
instrumentType=IPLC_LC 且 movementType=UTILIZE 且 tenorType=SIGHT 且 status!=PENDING 且 releasedAt 已设置

## Result
产生 2 行（创建 + 终结），而非 1 行（主行）

## Example
LC S01：A1（ISSUE，主行）-> A3（UTILIZE，创建行 @createdAt）-> A8（SG ISSUE，主行）-> A4（同一 UTILIZE，终结行 @releasedAt）——3 个实际 movement 产生了 4 条时间线记录

## Verification Note
已直接阅读具体的函数实现；与声明内容完全一致，包括全部 5 个并列条件。

## Source Evidence

实现:
- `src/app/transaction-builder/inquire-events.service.ts:82-96`

测试:
- `inquire-events.service.spec.ts:142-197,213-225,226-239`

## Related Knowledge
- [[BalanceMovement]]
- toEventRows()——创建/终结行拆分
- InquiredEvent（适配器）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
