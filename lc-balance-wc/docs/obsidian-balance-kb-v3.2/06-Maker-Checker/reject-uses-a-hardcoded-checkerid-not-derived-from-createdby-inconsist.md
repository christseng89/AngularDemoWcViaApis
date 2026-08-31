---
knowledge_id: reject-uses-a-hardcoded-checkerid-not-derived-from-createdby-inconsist
title: "reject() 使用硬编码的 checkerId，而非依据 createdBy 推导——与 release() 行为不一致"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 本次分析快照中无 .git 历史记录，详见 [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# reject() 使用硬编码的 checkerId，而非依据 createdBy 推导——与 release() 行为不一致

与 release() 不同，reject() 始终调用 api.reject(movementId, 'checker1', 'MANUAL_TEST_REJECT')，而不考虑该笔变动记录自身的 createdBy——它并不像 release() 那样，依据 createdBy 推导出应使用 checker1 还是 checker2。不过在 movementId 本身的取值上，它正确地优先使用 selectedCheckerMovement 而非 submitResult，这一点与 release() 自身的优先级顺序保持一致。

## Source Evidence

- `checker-actions.service.spec.ts:409-437`
- `checker-actions.service.ts:151-159`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
