---
knowledge_id: evaluatecontractcloseeligibility-private-service-method-3-call-sites
title: "evaluateContractCloseEligibility()（私有服务方法，3 处调用点）"
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

# evaluateContractCloseEligibility()（私有服务方法，3 处调用点）

用真实数据包装 evaluateCloseEligibility()：通过 parentLogicalContractId 遍历整棵事件树（root 自身的 movements + SHGT + Acceptance 子级，以及针对 EPLC_CONFIRMATION 的 Examination 子级），计算 hasOpenEvents（树中任意位置存在 PENDING，外加仅限 Export 的、RELEASED 但 presentDocsConsumedAt 未设置的 Examination 情形）以及 SG/Acceptance 的 Confirmed Balance。接受可选的 excludeMovementId（供 release() 的重新检查使用，因为此时 CLOSE movement 本身仍处于 PENDING，不能自我阻塞）和一个仅由 listCloseEligibleContracts() 的批量路径使用的可选 preFetched bundle。

## 证据来源

- `microservices/balance-component/src/service/balanceService.ts lines 413-467`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
