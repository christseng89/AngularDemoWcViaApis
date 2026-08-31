---
knowledge_id: MOVEMENT-RULE-007
title: "AMEND_DECREASE 充足性检查的基准是 Tight Available Balance，而非普通的 Available Balance"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - movement
  - confirmed
---

# MOVEMENT-RULE-007 — AMEND_DECREASE 充足性检查的基准是 Tight Available Balance，而非普通的 Available Balance

## 状态
CONFIRMED

## 业务规则
checkAmendDecreaseSufficiency 的 tightAvailableBalance 参数，等于 Confirmed Balance 减去仍处于 PENDING 状态的减额 movement，再减去未偿的表外（off-balance-sheet）风险敞口（IPLC_LC/EPLC_LC 对应 SHGT 风险敞口，EPLC_CONFIRMATION 对应 Present Docs Earmark）——这与 A3/B3 自身的 checkUtilizeSufficiency/checkPresentDocsIssueSufficiency 所使用的基准相同。此前该检查使用的是普通的 Available Balance，可能导致某笔 LC 的额度被压缩到低于其自身未偿的表外风险敞口。该基准被统一应用于 A2 自身的 AMEND_DECREASE，以及 B2 中带负号的 AMEND（Export 一侧没有单独的 AMEND_INCREASE/AMEND_DECREASE movementType——参见下方关于 B2 方向的规则）；此前 B2 自身的减额方向此前完全没有任何充足性检查，直到该基准被扩展应用到它身上。

## 条件
ceilingAmount > tightAvailableBalance（tightAvailableBalance 严格 ≤ 普通 Available Balance）

## 结果
一笔在旧的『普通 Available』基准下本会通过的减额，现在会在『Tight Available』基准下被正确地拒绝。

## 示例
U01：Confirmed 为 100，offBalanceExposure 为 10（未偿 SG），普通 Available 为 100，Tight Available 为 90——一笔 95 的减额过去会通过（95≤100），现在则会被正确拒绝（95>90）。

## 验证说明
已对照 amendDecrease.ts 以及 balanceService.ts 中的 movementTypeRegistry（amendShaped 条目，已在第 179-186/241-243 行逐字验证）、以及 export-case-10 实际的 AMEND +20,000/-130,000 测试数据确认。已将 3 条几乎重复、分别来自 domain、服务编排（service-orchestration）、质量整改历史（quality-remediation-history）三个角度、描述同一基准变更修复的候选条目（"AMEND_DECREASE 基准已变更……"、"A2/B2 减额现在依据 Tight Available Balance 检查……"、"B2 自身的 AMEND 减额方向获得了真正的充足性检查……"）合并为本条目。

## 来源证据

实现：
- `microservices/balance-component/src/domain/amendDecrease.ts:16-24`
- `microservices/balance-component/src/service/balanceService.ts:179-186,241-243`

测试：
- `backend/data/businessCases.js:2258-2315（export-case-10，已实地验证）`
- `backend/test/businessCases.test.js:80-83`

## 相关知识
- [[BalanceMovement]]
- [[InstrumentType|checkDecreaseShapedSufficiency()——按 instrumentType 的 Tight Available Balance 推导]]
- amendShaped movementTypeRegistry 条目
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
