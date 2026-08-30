---
knowledge_id: displaymovementtype-displaymovementamount
title: "displayMovementType() / displayMovementAmount()"
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

# displayMovementType() / displayMovementAmount()

一对相互配合的纯展示函数。仅针对 instrumentType==='EPLC_CONFIRMATION' && movementType==='AMEND'（即 B2 自身共用的 movementType）的情形，displayMovementType() 会读取带符号的 `amount`，并回传 'AMEND_INCREASE'（amount >= 0，含恰好为 0 的情形）或 'AMEND_DECREASE'（amount < 0）；displayMovementAmount() 则针对同一情形回传去除符号后的幅度（Math.abs）。其余所有 (instrumentType, movementType) 组合，amount 与 movementType 都会完全原样通过、不作任何转换——包括 A2 自身真正各自独立的 AMEND_INCREASE/AMEND_DECREASE movementType，本就无需任何转换。这两个函数都不会写回任何模型/状态——仅作展示用途，在渲染点调用。

## Source Evidence

- `balance-component.model.spec.ts:683-718`
- `balance-component.model.ts:665-687`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
