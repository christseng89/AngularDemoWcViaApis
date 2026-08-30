---
knowledge_id: release-s-close-specific-re-check-and-markclosed-side-effect
title: "release() 针对 CLOSE 的专属重新检查与 markClosed() 副作用"
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

# release() 针对 CLOSE 的专属重新检查与 markClosed() 副作用

针对 CLOSE movement，release() 会重新执行一次 evaluateContractCloseEligibility（排除该 movement 自身），并在允许状态转换之前，重新校验该 movement 已冻结的 ceilingAmount 是否仍然等于当前的 Confirmed Balance；校验通过后，调用 contracts.markClosed(balanceContractId, releasedAt)，将 ContractStatus 设置为 CLOSED。

## 证据来源

- `microservices/balance-component/src/service/balanceService.ts lines 1159-1182, 1259-1266`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
