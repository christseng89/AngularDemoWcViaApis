---
knowledge_id: computependingdecreasetotal
title: "computePendingDecreaseTotal()"
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

# computePendingDecreaseTotal()

一个导出（exported）函数，仅对每一笔当前 PENDING 状态异动中呈**负数**符号的部分取绝对值后加总（即仅计入呈减少型态的 PENDING 异动，绝不会与同一合约上呈增加型态的 PENDING 异动相抵）。返回一个正值幅度，用途是在其他地方（balanceService.ts 的 assembleSnapshot() 中，不在本次萃取所读取的文件范围内）从 Confirmed Balance 中扣减，以推导出 Tight Available Balance。

## Source Evidence

- `microservices/balance-component/src/domain/balanceDerivation.ts lines 79-99 (function + doc comment referencing business instruction 2026-08-20)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
