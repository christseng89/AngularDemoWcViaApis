---
knowledge_id: statusbadgeclass
title: "statusBadgeClass()"
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

# statusBadgeClass()

纯函数，针对某分录的状态返回一个 CSS 类名字符串（'tb-status-badge--negative'/'--pending'/'--earmark'/'--approved'/'--neutral'/''），其分支逻辑与 displayStatus() 完全一致：CLOSE 分录处于 PENDING/RELEASED → --negative；PENDING → 若已预留（earmark）且已确认则为 --earmark，否则为 --pending；RELEASED → 若为预留则为 --earmark，否则为 --approved；REJECTED/CANCELLED → --negative；SUPERSEDED → --neutral；无法识别的状态 → ''。

## 来源证据

- `balance-component.model.spec.ts:811-845`
- `balance-component.model.ts:617-631`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
</content>
