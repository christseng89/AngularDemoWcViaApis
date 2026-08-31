---
knowledge_id: eplc-confirmation-amend-sign-folding
title: "EPLC_CONFIRMATION AMEND 正负号折叠处理"
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

# EPLC_CONFIRMATION AMEND 正负号折叠处理

与 IPLC_LC/EPLC_LC（拥有各自独立的 AMEND_INCREASE/AMEND_DECREASE movementType，各自带有固定的 MOVEMENT_DIRECTION）不同，EPLC_CONFIRMATION 只有单一的 AMEND movementType，其固定的方向系数（+1）本身并不能区分 Increase 与 Decrease。方向改由所提交金额的正负号来体现（负数即代表 decrease）。deriveContingentAccountEntry() 会在选定哪一个科目担任 Dr、哪一个担任 Cr 之前，先把这个正负号折叠进基础方向（netDirection），随后无论如何都会把分录自身的 `amount` 字段输出为绝对值。对于其他所有 movementType 而言，这一处理不会产生任何效果，因为它们提交时的金额永远是正数。

## 来源证据

- `microservices/balance-component/src/domain/contingentAccountEntry.ts:129-150`
- `test/unit/domain/contingentAccountEntry.test.ts:112-153`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
