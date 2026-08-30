---
knowledge_id: balancemovementstore-append-only-repository-over-balance-movements
title: "BalanceMovementStore ——覆盖在 balance_movements 之上的只追加式仓储层"
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

# BalanceMovementStore ——覆盖在 balance_movements 之上的只追加式仓储层

BalanceMovementStore 自身顶部的文档注释说明该表是只追加式（append-only）的——它从不物理删除任何一行，只会插入新行，并通过一组专用方法更新特定的列：updateStatus()（status/released*/balanceBefore/After/snapshot 列/cancelled*）、markPresentDocsConsumed()、submitByMaker() 以及 acknowledge()。读取方法包括 findById、findByContractAndEventSeq、findByBusinessEventId、listByContract、listShgtMovementsForParent/listExaminationMovementsForParent/listAcceptanceMovementsForParent（以及它们对应的批量版本 'ForParents'/listByContractIds，用于避免 N+1 查询）。

## 来源证据

- `microservices/balance-component/src/store/balanceMovementStore.ts:1-13,119-509`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
