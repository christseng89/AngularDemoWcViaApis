---
knowledge_id: ib-eb-number-terminology-by-side
title: "按业务方向区分的 IB/EB 编号术语"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 本次分析快照中无 .git 历史记录，详见 [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# 按业务方向区分的 IB/EB 编号术语

同一个底层的 `ibNumber` 字段/API 结构，在 Import 方向的 Acceptance 中显示为"IB Number"（Import Bill，进口汇票号），在 Export 方向的 Acceptance 中显示为"EB Number"（Export Bill，出口汇票号）——这纯粹是显示标签上的区分，并非数据模型层面的拆分。判断依据是 activeFunctionSide（或该功能自身的 instrumentType==='EPLC_ACCEPTANCE'），而非另设一个独立字段。

## Source Evidence

- `src/app/transaction-builder/function-policy.spec.ts lines 168-185`
- `src/app/transaction-builder/function-policy.ts lines 60-67, 140-146`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
