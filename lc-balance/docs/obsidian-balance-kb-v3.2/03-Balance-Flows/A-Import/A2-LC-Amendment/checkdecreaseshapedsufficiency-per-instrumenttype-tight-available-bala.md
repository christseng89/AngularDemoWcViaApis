---
knowledge_id: checkdecreaseshapedsufficiency-per-instrumenttype-tight-available-bala
title: "checkDecreaseShapedSufficiency() — 按 instrumentType 划分的 Tight Available Balance 推导"
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

# checkDecreaseShapedSufficiency() — 按 instrumentType 划分的 Tight Available Balance 推导

私有服务方法（Private service method），在调用 checkAmendDecreaseSufficiency 之前计算 tightAvailableForDecrease：对于 IPLC_LC/EPLC_LC，净额扣除 SHGT 表外风险敞口（off-balance exposure）；对于 EPLC_CONFIRMATION，净额扣除 Present Docs Earmark（刻意从严处理，不设 provisionally-consumed 的例外覆盖）；其他 instrumentType 则退回使用普通的 availableBalance。

## 证据来源

- `microservices/balance-component/src/service/balanceService.ts lines 257-283`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
