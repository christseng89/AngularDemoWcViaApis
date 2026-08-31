---
knowledge_id: five-core-balance-figures-confirmed-available-pending-earmark-total-of
title: "五项核心余额数字（已确认余额/可用余额/待处理圈存合计/表外风险敞口/紧缩可用余额）"
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

# 五项核心余额数字（已确认余额/可用余额/待处理圈存合计/表外风险敞口/紧缩可用余额）

每一个余额快照来源（实时 GET .../balance 接口、createMovement() 时点快照、release() 时点快照）都是在查询当下，根据合约的完整动作历史即时推算出这五项数字——没有任何一项直接存储在合约表列中。已确认余额（Confirmed Balance）只汇总已 RELEASED 动作的 ceilingAmount×方向；可用余额（Available Balance）在此基础上再加上仍为 PENDING 的动作；待处理圈存合计（Pending Earmark Total）就是 PENDING 部分的带符号差额（可用余额 − 已确认余额）；表外风险敞口（Off-Balance Exposure，仅适用于 LC/EPLC_LC）以子级 SHGT 的签发额冲抵赎回额；紧缩可用余额（Tight Available Balance，仅适用于 LC/EPLC_LC/EPLC_CONFIRMATION）则进一步从已确认余额中扣除 SHGT 风险敞口或单据提示圈存（Present Docs Earmark）。这五项数字全部经由同一个共享函数 assembleSnapshot() 汇总产出，因此实时查询结果与两种持久化快照永远不会互相偏离。

## Source Evidence

- `Balance-Figures-Calculation-Logic.txt lines 154-207 (§1 The Five Core Figures — Exact Formulas)`
- `Balance-Figures-Calculation-Logic.txt lines 16-23 (Source of truth citation to domain/balanceDerivation.ts, offBalanceExposure.ts, tolerance.ts, service/balanceService.ts assembleSnapshot())`

## Related Knowledge

- [[Business-Rule-Index|业务规则索引]]
- [[Balance Component Overview|余额组件概览]]
