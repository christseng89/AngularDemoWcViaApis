---
knowledge_id: EXPOSURE-RULE-006
title: "computePresentDocsEarmark / Pending / Approved——合计与拆分两种形式的交单占用额指标，均排除已消耗与临时已消耗的呈现"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - exposure
  - confirmed
---

# EXPOSURE-RULE-006 — computePresentDocsEarmark / Pending / Approved——合计与拆分两种形式的交单占用额指标，均排除已消耗与临时已消耗的呈现

## 状态
CONFIRMED

## 业务规则
computePresentDocsEarmark() 汇总所有状态为 PENDING 或 RELEASED 的 EPLC_EXAMINATION CREATE 变动记录的 ceilingAmount，排除任何已设置 presentDocsConsumedAt 的记录，以及任何 movementId 属于调用方传入的 provisionallyConsumedIds 集合的记录。computePresentDocsEarmarkPending() 只汇总 status===PENDING 的记录（无需过滤已消耗状态，因为一条 PENDING 记录不可能已被 presentDocsConsumedAt 或被临时引用）。computePresentDocsEarmarkApproved() 只汇总 status===RELEASED 的记录，同样排除 presentDocsConsumedAt 与 provisionallyConsumedIds。Pending 与 Approved 之和始终等于合计指标（即文档自身的"#8+#9=#4"不变式）。

## 触发条件
合计指标：status ∈ {PENDING, RELEASED} 且 !presentDocsConsumedAt 且 movementId ∉ provisionallyConsumedIds。Pending 分项：status==='PENDING'。Approved 分项：status==='RELEASED' 且 !presentDocsConsumedAt 且 !provisionallyConsumedIds.has(movementId)。

## 结果
合计指标供 checkPresentDocsIssueSufficiency/checkAmendDecreaseSufficiency 使用；拆分指标是 BalanceSnapshot 上单独的展示字段。

## 示例
e1 CREATE 50000 PENDING，e2 CREATE 70000 RELEASED（未消耗），e3 CREATE 999999 RELEASED 但已设置 presentDocsConsumedAt → 合计占用额 = 120000（e3 被排除）；Pending=50000，Approved=70000。

## 验证说明
仅有一对候选项（合计函数与拆分函数），未发现其他重复。直接阅读了完整的函数体；论断完全一致。

## 来源证据

实现:
- `microservices/balance-component/src/domain/offBalanceExposure.ts:152-186, 220-251 (verified read in full)`

测试:
- `microservices/balance-component/test/unit/domain/offBalanceExposure.test.ts:50-57, 59-74`

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- 交单占用额生命周期：Pending → Approved → Consumed
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
