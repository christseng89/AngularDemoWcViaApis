---
knowledge_id: sight-tenor-utilize-4-eyes-gate-requires-a-real-maker-submit-before-re
title: "Sight 期限 UTILIZE 的四眼门禁：放行前必须先有真正的 Maker Submit"
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

# Sight 期限 UTILIZE 的四眼门禁：放行前必须先有真正的 Maker Submit

当放行一笔 IPLC_LC/UTILIZE Movement 时，如果其父合约声明的 tenorType 为 SIGHT，且该 Movement 尚未有 makerSubmittedAt，release() 会抛出 409 ILLEGAL_STATE_TRANSITION（提示「要求先有 Maker Submit」）。该门禁的适用范围很窄：一笔 Usance UTILIZE（通过 A6 自身的复合流程放行，从不调用 maker-submit）以及一笔发生在未声明任何 tenorType 的合约上的 UTILIZE（为兼容较早版本 Business Case Runner 用例而保留），两者都被豁免，可以正常放行。

## Source Evidence

- `test/unit/app.test.ts:2737-2811`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
