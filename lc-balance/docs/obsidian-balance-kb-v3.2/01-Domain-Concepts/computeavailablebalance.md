---
knowledge_id: computeavailablebalance
title: "computeAvailableBalance()"
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

# computeAvailableBalance()

一个导出（exported）函数，接收一个已计算完成的 confirmedBalance 及异动清单；仅对 status === 'PENDING' 的异动加总 signedAmount()，并将这个差额加到 confirmedBalance 上。返回值即为 Available Balance = Confirmed ± Σ PENDING。

## Source Evidence

- `microservices/balance-component/src/domain/balanceDerivation.ts lines 70-77`
- `microservices/balance-component/test/unit/domain/balanceDerivation.test.ts lines 26-33`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
