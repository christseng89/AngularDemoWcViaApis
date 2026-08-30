---
knowledge_id: amenddecreasecheckresult-discriminated-union
title: "AmendDecreaseCheckResult（可辨识联合类型，discriminated union）"
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

# AmendDecreaseCheckResult（可辨识联合类型，discriminated union）

AMEND_DECREASE 充足性检查的结果类型，与 RedeemCheckResult 采用相同的 {ok:true}|{ok:false;error} 结构（两者在 BAL-142 重构中一并转换）。

## 来源证据

- `microservices/balance-component/src/domain/amendDecrease.ts lines 36-37`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
