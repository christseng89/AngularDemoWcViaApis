---
knowledge_id: checkacceptancetenorconsistency
title: "checkAcceptanceTenorConsistency()"
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

# checkAcceptanceTenorConsistency()

tenorRouting.ts 中的纯函数，返回一个可辨识联合类型（discriminated union）{ok:true} | {ok:false; error:string}。给定母信用证自身的 tenorType（来自 ISSUE）、母合约 id，以及请求中的 Acceptance tenorType，它会拒绝：(a) 任何在 tenorType 为 SIGHT 的母合约下发起的 Acceptance CREATE；以及 (b) 任何 requestedTenorType 与非空 parentTenorType 不一致的 Acceptance。当 parentTenorType 为 null/undefined（遗留、未声明 tenor 的母合约）或 requestedTenorType 为 null/undefined 时，函数不做任何处理（no-op，ok:true）。

## 证据来源

- `microservices/balance-component/src/domain/tenorRouting.ts (full file)`
- `microservices/balance-component/test/unit/domain/tenorRouting.test.ts (full file)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
