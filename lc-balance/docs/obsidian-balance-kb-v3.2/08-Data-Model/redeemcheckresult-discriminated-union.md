---
knowledge_id: redeemcheckresult-discriminated-union
title: "RedeemCheckResult（可辨识联合类型）"
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

# RedeemCheckResult（可辨识联合类型）

这是共享的赎回/结算充足性检查所使用的结果类型：{ok:true} | {ok:false; error:string}。在 BAL-142 这次调整中，由原本的 {ok:boolean; error?:string} 形态转换而来，使调用方不再需要对 error 做非空断言。它被 checkRedeemSufficiency() 使用，并由 balanceService.ts 中处理 outstandingCapped 充足性判断的逻辑所消费。

## 来源证据

- `microservices/balance-component/src/domain/shgtRedeem.ts lines 26-29`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
