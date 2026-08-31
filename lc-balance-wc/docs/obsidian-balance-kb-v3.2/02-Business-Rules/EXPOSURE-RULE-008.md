---
knowledge_id: EXPOSURE-RULE-008
title: "EPLC_EXAMINATION 与表内资产类 instrumentType 永远不会产生 contingentAccountEntry（单据/交单收讫不影响或有负债总账）"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 分析快照中没有 .git 历史记录，参见 [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - exposure
  - confirmed
---

# EXPOSURE-RULE-008 — EPLC_EXAMINATION 与表内资产类 instrumentType 永远不会产生 contingentAccountEntry（单据/交单收讫不影响或有负债总账）

## 状态
CONFIRMED

## 业务规则
deriveContingentAccountEntry() 对 EPLC_EXAMINATION（B3，依据设计原则 D3「只有法律事件才会移动余额」，属 MEMO_ONLY）以及 EPLC_DUE_FROM_ISSUING_BANK/EPLC_ACCEPTANCE_REIMB_RECEIVABLE/EPLC_EXPORT_BILLS_DISCOUNTED（属表内资产类工具，明确不在 Balance Component 的或有负债范畴内）无条件返回 null，与 movementType 无关。这推翻了早期版本曾为 B3 指定具名 Dr/Cr 配对的设计。

## 条件
instrumentType ∈ {EPLC_EXAMINATION, EPLC_DUE_FROM_ISSUING_BANK, EPLC_ACCEPTANCE_REIMB_RECEIVABLE, EPLC_EXPORT_BILLS_DISCOUNTED}。

## 结果
这些异动永远不会落地任何 Dr/Cr 配对；ledger.html 参考文件本身以可见的「No GL effect」备忘标签记录这些行，而非直接省略，因此 B3/A3/A3S 都能被明确追踪到。

## 示例
EPLC_EXAMINATION CREATE 5000 → null。参考用的 ledger.html 中，Document Arrival received（A3/A3S）与 Present Docs received（B3）均标示为「No GL effect」/备忘，与此代码行为完全一致。

## 验证说明
将「exposure 领域代码」候选与「ledger-html 中『单据/交单收讫不产生或有 GL 影响』」候选合并——直接 grep ledger.html 文件（第 530-534、616-620、661 行）核实，确认 A3/A3S 与 B3 均被明确标注为备忘/「No GL effect」行，与代码行为完全吻合。

## 原始码证据

实现：
- `microservices/balance-component/src/domain/contingentAccountEntry.ts:16-29, 89-99 (verified read)`

测试：
- `microservices/balance-component/test/unit/domain/contingentAccountEntry.test.ts:167-182`

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- EPLC_EXAMINATION（B3 交单）永远不会记录真实的账目分录
- 表内资产类工具不属于或有分录范畴
- 设计原则 D3
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
