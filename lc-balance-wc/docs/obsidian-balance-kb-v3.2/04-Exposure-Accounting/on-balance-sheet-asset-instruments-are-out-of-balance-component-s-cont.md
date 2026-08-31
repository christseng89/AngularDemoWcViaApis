---
knowledge_id: on-balance-sheet-asset-instruments-are-out-of-balance-component-s-cont
title: "表内资产类工具不属于 Balance Component 的或有分录范畴"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 本次分析快照中无 .git 历史记录，参见 [[Source-to-Knowledge-Map|来源知识对照表]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# 表内资产类工具不属于 Balance Component 的或有分录范畴

完整的范畴判断说明见 [[Balance Component Overview#範疇之外|余额组件概览的「范畴之外」小节]]，此处不重复展开。

技术要点：
- EPLC_DUE_FROM_ISSUING_BANK、EPLC_ACCEPTANCE_REIMB_RECEIVABLE、EPLC_EXPORT_BILLS_DISCOUNTED（保兑 Honour/Accept 后转化成的表内资产类工具）均不会由本模块产生或有科目分录对——deriveContingentAccountEntry() 对它们一律直接返回 null，属于设计使然（"On-Balance-Sheet Liability remains out of scope for the Balance Component"）。

## Source Evidence

- `microservices/balance-component/src/domain/contingentAccountEntry.ts:16-21, 93-98`
- `test/unit/domain/contingentAccountEntry.test.ts:174-182`

## Related Knowledge

- [[Business-Rule-Index|业务规则索引]]
- [[Balance Component Overview|余额组件概览]]
