---
knowledge_id: BALANCE-RULE-009
title: "表外 SG 风险敞口的 Pending/Approved 拆分（Figures #8/#9）在构造上恰好等于表外风险敞口（Figure #4）"
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

# BALANCE-RULE-009 — 表外 SG 风险敞口的 Pending/Approved 拆分（Figures #8/#9）在构造上恰好等于表外风险敞口（Figure #4）

## 状态
CONFIRMED

## 业务规则
computeOffBalanceExposure() 将 SHGT 变动记录精确筛选为两类——RELEASED（任意 movementType）与带条件的 PENDING（ISSUE 始终计入；REDEEM 仅在匹配到同一 LC 上仍处于 PENDING 状态的 UTILIZE 的 businessEventId 时才计入）——并在这个单一的筛选集合内对 ISSUE 取正、REDEEM 取负后求和。设计文档中的"SG（Pending）"与"SG（Approved）"两个指标，只是对同一计算按状态拆分后的纯文档层面呈现，因此二者之和在构造上必然等于 offBalanceExposure，而并非独立计算或作为单独的 API 字段暴露。

## 触发条件
instrumentType ∈ {IPLC_LC, EPLC_LC}，在父合约上

## 结果
Figure #8 + Figure #9 始终精确等于表外风险敞口（#4），但 #8 和 #9 都不是真正独立计算/测试的字段——仅为展示用的文档惯例。

## 示例
不适用——这是一个代数恒等式，而非独立的运行时数值。

## 验证说明
应用了降级审查：原始候选项只引用了设计文档。直接重新阅读了 computeOffBalanceExposure() 的实现，确认该不变式在构造上成立（代码自身的 RELEASED/PENDING 筛选拆分与文档中的 #8/#9 拆分完全一致）。维持 CONFIRMED，但明确补充了一条警示说明：#8/#9 并非独立实现或测试的字段——只有 offBalanceExposure 本身是真实、经过测试的值；这一拆分只是文档层面的便利表示，其正确性依赖于对代码的阅读，而非任何专门的测试。

## 来源证据

实现:
- `microservices/balance-component/src/domain/offBalanceExposure.ts:48-71 (computeOffBalanceExposure)`
- `analysis/Balance-Figures-Calculation-Logic.md (Figures #8/#9, invariant note after §2 table)`

测试:
- （未引用直接测试证据）

## 相关知识
- [[Balance Derivation Rules]]
- computeOffBalanceExposure()
- 三种占用额／子账拆分
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
