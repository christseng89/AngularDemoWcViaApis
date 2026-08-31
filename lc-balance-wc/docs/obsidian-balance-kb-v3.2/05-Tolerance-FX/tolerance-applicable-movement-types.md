---
knowledge_id: tolerance-applicable-movement-types
title: "TOLERANCE_APPLICABLE_MOVEMENT_TYPES"
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

# TOLERANCE_APPLICABLE_MOVEMENT_TYPES

模块级别的 ReadonlySet<string>，精确包含 ISSUE、AMEND_INCREASE、AMEND_DECREASE、AMEND 四者。文档中说明 AMEND 是 EPLC_CONFIRMATION 自身的修改类 movementType（出口信用证并没有单独区分 INCREASE/DECREASE，方向由金额的正负号决定，详见 CLAUDE.md 的 B2 决策记录）。任何不在此集合中的 movementType，均会返回未经变更的原始面值金额。

## 来源证据

- `microservices/balance-component/src/domain/balanceDerivation.ts line 51`
- `src/domain/tolerance.ts:34-39`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
