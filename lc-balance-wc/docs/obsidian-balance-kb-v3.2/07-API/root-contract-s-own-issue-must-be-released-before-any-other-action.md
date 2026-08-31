---
knowledge_id: root-contract-s-own-issue-must-be-released-before-any-other-action
title: "根合约自身的 ISSUE 必须先被放行，才能进行任何其他动作"
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

# 根合约自身的 ISSUE 必须先被放行，才能进行任何其他动作

只要针对某个根 IPLC_LC/EPLC_LC/EPLC_CONFIRMATION 合约（或该合约下新建的子合约）创建一笔非 ISSUE 的 Movement，而该根合约自身的 ISSUE Movement 尚未处于 RELEASED 状态，assertRootIssueReleased() 就会抛出 IllegalStateTransitionError（409 ILLEGAL_STATE_TRANSITION）。这一防护堵住了一个真实存在过的缺陷：一份刚创建、尚未放行的 LC 在外观上与一份已获批的 LC 毫无区别，导致一笔 UTILIZE 可以对其放行，从而把 Confirmed Balance（仅统计 RELEASED 部分之和）推成负数。错误信息中会点明具体的 instrument/naturalKey/balanceContractId，并提示「请先放行该 Issue」。

## Source Evidence

- `src/service/balanceService.ts:840-859`
- `src/service/balanceService.ts:894-916`
- `test/unit/app.test.ts:2971-2974`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
