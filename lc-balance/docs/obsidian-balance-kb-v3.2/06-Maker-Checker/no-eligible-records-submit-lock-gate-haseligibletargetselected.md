---
knowledge_id: no-eligible-records-submit-lock-gate-haseligibletargetselected
title: "「无合格记录」提交锁定门控（hasEligibleTargetSelected）"
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

# 「无合格记录」提交锁定门控（hasEligibleTargetSelected）

A2-A9/B2-B5（A1/B1 除外）会锁定其输入字段与 Submit 按钮，直到真正选中一条合格的目标记录为止。该逻辑刻意独立于 validateSubmit()（后者同时还会校验已输入字段的取值），单独从 Strategy 字段重新推导出各功能自身所需的"选择项形状"——因为这里的重点是一旦选中目标就解锁字段，而不是要求字段此时已经全部填好；尤其是 A4，它根本不会调用 validateSubmit()。

## Source Evidence

- `src/app/transaction-builder/submit-rules.spec.ts lines 652-742`
- `src/app/transaction-builder/submit-rules.ts lines 219-249`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
