---
knowledge_id: computeconfirmedbalance
title: "computeConfirmedBalance()"
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

# computeConfirmedBalance()

一个导出（exported）函数，仅对 status === 'RELEASED' 的异动加总 signedAmount()。使用的是 ceilingAmount，而非 amount。此行为已同时经原始码与一个会将 PENDING 异动从加总中过滤掉的、可通过的单元测试所确认。

## Source Evidence

- `microservices/balance-component/src/domain/balanceDerivation.ts lines 65-68`
- `microservices/balance-component/test/unit/domain/balanceDerivation.test.ts lines 10-24`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
