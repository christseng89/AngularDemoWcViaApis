---
knowledge_id: listcloseeligiblecontracts-step-1-picker-hint-with-n-1-batch-fetch
title: "listCloseEligibleContracts()——Step-1 picker 提示，采用 N+1 批量抓取（batch-fetch）"
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

# listCloseEligibleContracts()——Step-1 picker 提示，采用 N+1 批量抓取（batch-fetch）

等同于 GET /balance-contracts/close-eligible：拒绝非 root 的 instrumentType，先抓取一批上限为 200 条的 ACTIVE catalog，然后分别通过 listByContractIds/listShgtMovementsForParents/listAcceptanceMovementsForParents/listExaminationMovementsForParents 各批量抓取一次全部 4 类 movement 列表（own/SG/Acceptance/Examination），在内存中对每个候选项进行判定，最后对经过筛选（FILTERED）后的合格集合做分页。

## 证据来源

- `microservices/balance-component/src/service/balanceService.ts lines 469-516`
- `microservices/balance-component/test/unit/service/closeEligibleContractsBatch.test.ts lines 149-278`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
