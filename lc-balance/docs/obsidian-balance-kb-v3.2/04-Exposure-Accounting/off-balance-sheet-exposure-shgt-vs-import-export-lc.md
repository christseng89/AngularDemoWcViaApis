---
knowledge_id: off-balance-sheet-exposure-shgt-vs-import-export-lc
title: "表外风险敞口（SHGT 对比进口/出口信用证）"
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

# 表外风险敞口（SHGT 对比进口/出口信用证）

提货担保（Shipping Guarantee，SHGT）让进口商能够在正本装运单据到达前先行提货，但银行的 SG 承诺仍会占用 LC 额度，尽管 SHGT 本身是一份独立合约，尚不构成一次 LC 的 UTILIZE。当单据最终到达（单据到达 / A3）时，由此产生的 UTILIZE 绝不能被允许重复占用同一 LC 项下、已由未偿 SG 预留的额度。`computeOffBalanceExposure()` 正是用来汇总这类"已预留但尚未动用"的 SG 风险敞口的函数，以便在允许单据到达（或新签发一笔 SG）之前，先从该 LC 自身的紧缩可用余额中扣除这部分敞口。

## Source Evidence

- `microservices/balance-component/src/domain/offBalanceExposure.ts:1-74 (computeOffBalanceExposure)`

## Related Knowledge

- [[Business-Rule-Index|业务规则索引]]
- [[Balance Component Overview|余额组件概览]]
