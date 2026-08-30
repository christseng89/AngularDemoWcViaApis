---
knowledge_id: BALANCE-RULE-010
title: "交单占用额（Pending）+（Approved）之和，等于 EPLC_CONFIRMATION 场景下严格可用余额所减去的合计指标"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - balance
  - confirmed
---

# BALANCE-RULE-010 — 交单占用额（Pending）+（Approved）之和，等于 EPLC_CONFIRMATION 场景下严格可用余额所减去的合计指标

## 状态
CONFIRMED

## 业务规则
computePresentDocsEarmarkPending() 汇总仍处于 PENDING 状态的 EPLC_EXAMINATION CREATE；computePresentDocsEarmarkApproved() 汇总已 RELEASED 且尚未被消耗（排除 provisionallyConsumedIds）的记录；computePresentDocsEarmark() 汇总两者的并集（PENDING+RELEASED，排除 presentDocsConsumedAt 与 provisionallyConsumedIds）——这正是严格可用余额在 EPLC_CONFIRMATION 合约上所减去的同一指标。

## 触发条件
instrumentType === EPLC_CONFIRMATION

## 结果
presentDocsEarmarkPending + presentDocsEarmarkApproved == 严格可用余额所减去的合计占用额，确保该 Confirmation 自身的严格可用余额与其交单占用额展示值永不矛盾。

## 示例
B4 U02 案例：交单占用额（Approved）10000 减去 10000（一旦 B4 自身仍处于 PENDING 状态的 HONOUR/ACCEPT 临时引用了它）-> 0，与 tightAvailableBalance 自身的 -0 一致，而非停留在过时的 -10000。

## 验证说明
直接重新阅读了全部三个函数。发现（并作为警示保留，而非降级）文档自身也披露的一个细微之处：computePresentDocsEarmarkPending() 完全不过滤 provisionallyConsumedIds，而合计函数 computePresentDocsEarmark() 却会过滤——两者之所以能保持一致，仅仅是因为一条仍处于 PENDING 状态的 B3 记录永远不可能被 provisionallyConsumed（只有已 RELEASED 的记录才能被 B4 引用），这一点在文档自身"实际中恒为 0"的说明中也有体现。维持 CONFIRMED，因为这种不对称性是一个有文档记载、且与代码一致的设计选择，而非缺陷或未经验证的论断。

## 来源证据

实现:
- `microservices/balance-component/src/domain/offBalanceExposure.ts:177-186,228-230,244-251`
- `analysis/Balance-Figures-Calculation-Logic.md (Figures #6/#7, invariant note after §2 table)`

测试:
- （未引用直接测试证据）

## 相关知识
- [[Balance Derivation Rules]]
- computePresentDocsEarmark()
- computePresentDocsEarmarkPending()
- computePresentDocsEarmarkApproved()
- 三种占用额／子账拆分
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
