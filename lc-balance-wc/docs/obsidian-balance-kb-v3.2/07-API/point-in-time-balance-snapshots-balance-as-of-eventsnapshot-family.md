---
knowledge_id: point-in-time-balance-snapshots-balance-as-of-eventsnapshot-family
title: "时点余额快照（balance-as-of / eventSnapshot 家族）"
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

# 时点余额快照（balance-as-of / eventSnapshot 家族）

GET /balance-movements/:id/balance-as-of，以及每笔 Movement 上捕获的 eventSnapshot/rootEventSnapshot/sgEventSnapshot/acceptanceEventSnapshot 字段，都会把余额画面冻结在该特定事件发生的那一刻——之后发生的兄弟账簿事件（例如随后签发的一笔 SHGT，或稍后创建的第二次交单）绝不会回溯性地改变某个已被捕获事件自身的 offBalanceExposure/presentDocsEarmark*/tightAvailableBalance 数值，尽管同一合约的 LIVE 快照确实会反映这些新事件。rootEventSnapshot 在根合约自身的 ISSUE 上为 null（没有可指向的对象），而在任何子合约 Movement（SHGT ISSUE、Acceptance CREATE）上则非空，指向父合约在那一时刻自身的余额。

## Source Evidence

- `test/unit/app.test.ts:3297-3503`
- `test/unit/app.test.ts:708-871`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
