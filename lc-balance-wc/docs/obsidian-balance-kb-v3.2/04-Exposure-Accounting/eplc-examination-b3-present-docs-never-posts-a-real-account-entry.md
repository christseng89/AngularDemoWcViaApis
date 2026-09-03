---
knowledge_id: eplc-examination-b3-present-docs-never-posts-a-real-account-entry
title: "EPLC_EXAMINATION（B3 Present Docs）显示内部虚帐但不外送会计"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-09-03
tags:
  - balance
  - domain-concept
---

# EPLC_EXAMINATION（B3 Present Docs）显示内部虚帐但不外送会计

B3（Present Docs／提示单据，`EPLC_EXAMINATION/CREATE`）依据 D3 属于 `MEMO_ONLY`。当前 `deriveContingentAccountEntry()` 会建立具名内部 memo pair：Dr `Export Bills — Received, Under Examination (memo)`／Cr `Export Bills — Contra (memo)`，让 Maker Submit 后、Checker Review／Release 及 Inquiry 都能看到同一份不可变虚帐。与此同时，`BalanceService` 因 `exposureNature=MEMO` 强制将下游 `accountEntries` 设为 `null`。因此「显示虚帐」与「不外送真实会计分录」同时成立；B3 不送 Accounting，也不需要 reversal。

## 来源证据

- `microservices/balance-component/src/domain/contingentAccountEntry.ts`
- `microservices/balance-component/src/service/balanceService.ts`
- `microservices/balance-component/test/unit/domain/contingentAccountEntry.test.ts`
- `microservices/balance-component/test/unit/app.test.ts`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
