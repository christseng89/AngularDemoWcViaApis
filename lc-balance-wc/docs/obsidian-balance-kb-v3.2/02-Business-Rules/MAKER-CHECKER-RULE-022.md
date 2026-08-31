---
knowledge_id: MAKER-CHECKER-RULE-022
title: "A3S 在 Submit 之前必须与一份具体的 Shipping Guarantee 绑定，且须包含其快照"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - maker-checker
  - confirmed
---

# MAKER-CHECKER-RULE-022 — A3S 在 Submit 之前必须与一份具体的 Shipping Guarantee 绑定，且须包含其快照

## 状态
CONFIRMED

## 业务规则
A3S（compoundSubmission.possibleShapes 包含 'documentArrivalWithSg'）在 Submit 之前，同时需要 selectedArrivalSg 与其解析后的 arrivalSgSnapshot——即便只是半解析状态（已挑选 SG，但快照尚未载入），也一样会导致失败。

## 适用条件
strategy.compoundSubmission.possibleShapes.includes('documentArrivalWithSg')。

## 结果
!selectedArrivalSg || !arrivalSgSnapshot -> 失败（"请先挑选这笔 Document Arrival 所对应的 Shipping Guarantee。"）

## 示例
已挑选 SG，但快照仍为 null -> 与完全未挑选 SG 时相同的失败结果。

## 核实说明
来源单一，测试引用直接对应。已确认。

## 来源证据

实现代码：
- `src/app/transaction-builder/submit-rules.ts:111-115`

测试：
- `src/app/transaction-builder/submit-rules.spec.ts:271-300`

## 相关知识
- [[Maker Checker Lifecycle]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
