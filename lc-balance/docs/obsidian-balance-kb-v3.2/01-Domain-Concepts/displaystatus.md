---
knowledge_id: displaystatus
title: "displayStatus()"
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

# displayStatus()

一个纯函数，将原始 MovementStatus（'PENDING'/'RELEASED'/其他）连同 instrumentType/movementType/phase/acknowledgedAt 一并映射为一个展示用标签。任何 instrumentType 下的 CLOSE movementType，都会在预扣（earmark）逻辑运行之前，直接短路为 'CLOSING'（PENDING 时）或 'CLOSED'（RELEASED 时）。其余情形下，若 isEarmarkFunction() 为真且 acknowledgedAt 已设定，PENDING 会变为 'EARMARKED'；若 earmark 为真但尚未确认，则为 'EARMARKING'；否则为普通的 'PENDING'。RELEASED 在 earmark 情形下变为 'EARMARKED'，否则为 'APPROVED'。其余任何状态字串（REJECTED/CANCELLED/SUPERSEDED）则原样通过、不作转换。

## Source Evidence

- `balance-component.model.spec.ts:811-845 (CLOSE-highlight describe block; only the CLOSE branch is directly spec-tested here — see gaps)`
- `balance-component.model.ts:544-560`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
