---
knowledge_id: isearmarkfunction
title: "isEarmarkFunction()"
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

# isEarmarkFunction()

纯函数 `isEarmarkFunction(instrumentType, movementType, phase?)`，仅对两种呈"预留（earmark）"形态的分录身份组合返回 true：IPLC_LC/UTILIZE（进口单据到达，A3/A3S）或 EPLC_EXAMINATION/CREATE（出口交单，B3）。任何 `phase === 'finalize'` 的行，无论其 instrumentType/movementType 组合为何，都会在身份判定运行之前就被无条件排除。当 instrumentType/movementType 为 null/undefined 时，会直接落入 false 分支处理。

## 来源证据

- `balance-component.model.spec.ts:638-679 (describe('isEarmarkFunction'))`
- `balance-component.model.ts:505-533 (doc comment stating the mapping table and the 'finalize' rationale)`
- `balance-component.model.ts:534-541 (function body)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
</content>
