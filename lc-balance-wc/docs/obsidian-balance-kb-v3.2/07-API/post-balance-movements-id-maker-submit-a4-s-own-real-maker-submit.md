---
knowledge_id: post-balance-movements-id-maker-submit-a4-s-own-real-maker-submit
title: "POST /balance-movements/:id/maker-submit——A4 专属的真正 Maker Submit"
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

# POST /balance-movements/:id/maker-submit——A4 专属的真正 Maker Submit

在一笔 IPLC_LC/UTILIZE Movement 上设置 makerSubmittedBy/makerSubmittedAt，且不触及其状态（仍保持 PENDING）。仅限于该确切的 instrumentType/movementType 组合（否则返回 400，提示信息为 "submitByMaker() only applies to an IPLC_LC UTILIZE movement"）。每笔 Movement 限单次使用：无论是第二次调用，还是对一笔已 RELEASED 的 Movement 调用，都会返回 409 ILLEGAL_STATE_TRANSITION（分别提示「已由 X 提交」/「非 PENDING 状态」）。makerSubmittedBy 是请求体中的必填字段（缺失则 400）。

## Source Evidence

- `test/unit/app.test.ts:2464-2612`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
