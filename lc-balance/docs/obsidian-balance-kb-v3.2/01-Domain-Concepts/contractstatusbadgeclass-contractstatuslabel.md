---
knowledge_id: contractstatusbadgeclass-contractstatuslabel
title: "contractStatusBadgeClass() / contractStatusLabel()"
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

# contractStatusBadgeClass() / contractStatusLabel()

这是一对与上文 statusBadgeClass()/displayStatus() 真正独立的纯函数，操作对象是 ContractStatus（ACTIVE/CLOSED/SUPERSEDED/CANCELLED），而非 MovementStatus——文件内的说明注释明确指出，'CANCELLED'/'SUPERSEDED' 虽然在两个枚举中共用相同字串，但含义并不相同，因此刻意不将其并入 statusBadgeClass()。一个可选的 `closingPending` 布林参数，会在一笔 CLOSE 异动已被 Maker 提交但尚未放行（Released）时，将一份 ACTIVE 合约覆写为红色/负向徽章与「CLOSING」标签。

## Source Evidence

- `balance-component.model.spec.ts:858-895`
- `balance-component.model.ts:633-663`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
