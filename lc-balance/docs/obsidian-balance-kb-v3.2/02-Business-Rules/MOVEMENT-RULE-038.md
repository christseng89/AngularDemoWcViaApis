---
knowledge_id: MOVEMENT-RULE-038
title: 'A6 复合放行顺序 — 源头的单据到单必须先于引用它的 Acceptance CREATE 被放行'
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: 'N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]'
snapshot_date: 2026-08-22
tags:
  - balance
  - movement
  - confirmed
---

# MOVEMENT-RULE-038 — A6 复合放行顺序 — 源头的单据到单必须先于引用它的 Acceptance CREATE 被放行

## Status

CONFIRMED

## Business Rule

当一笔 Acceptance（IPLC_ACCEPTANCE/EPLC_ACCEPTANCE CREATE）通过 referencedTransactionIdRef 引用其自身源头的单据到单时，Checker 必须先放行该单据到单动账，再放行 Acceptance CREATE 动账。

## Conditions

Acceptance CREATE 步骤携带的 referencedTransactionIdRef 指向此前已捕获的单据到单（UTILIZE）步骤

## Result

在该案例自身的步骤清单中，release(单据到单) 始终排在 release(Acceptance CREATE) 之前

## Example

import-case-7/8：『Checker 放行 B01 自身的单据到单（通过 referencedTransactionId 解析得到，先被放行）』先于『Checker 放行 Acceptance CREATE — B01』

## Verification Note

直接阅读了确切的步骤顺序（第 743-768 行）；已逐字确认单据到单放行步骤排在 Acceptance CREATE 放行步骤之前。

## Source Evidence

Implementation:

- `backend/data/businessCases.js:743-768,939-975`

Tests:

- `backend/test/businessCases.test.js:105-138`

## Related Knowledge

- [[BalanceMovement]]
- A6 / B4 关联环节放行与 B5 单腿结算对照
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
