---
knowledge_id: EXPOSURE-RULE-008
title: "EPLC_EXAMINATION 产生内部 memo voucher 但不外送会计；表内资产类仍不产生 contingentAccountEntry"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 分析快照中没有 .git 历史记录，参见 [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-09-03
tags:
  - balance
  - exposure
  - confirmed
---

# EXPOSURE-RULE-008 — EPLC_EXAMINATION 产生内部 memo voucher 但不外送会计；表内资产类仍不产生 contingentAccountEntry

## 状态
CONFIRMED

## 业务规则
`deriveContingentAccountEntry()` 对 `EPLC_EXAMINATION/CREATE` 建立内部 memo Dr/Cr pair，供 Maker、Checker 与 Inquiry 显示。B3 的 `exposureNature=MEMO`，所以 `BalanceService` 强制下游 `accountEntries=null`；内部 voucher 不送 Accounting，也不产生 reversal。`EPLC_DUE_FROM_ISSUING_BANK`／`EPLC_ACCEPTANCE_REIMB_RECEIVABLE`／`EPLC_EXPORT_BILLS_DISCOUNTED` 属表内资产类，仍返回 null。

## 条件
`EPLC_EXAMINATION/CREATE` 使用内部 memo family；三种 ON_BALANCE_ASSET instrument type 无 internal contingent family。

## 结果
B3 会持久化可见 Dr/Cr 虚帐，但不会形成外送 GL payload；三种 ON_BALANCE_ASSET instrument type 的 `contingentAccountEntry` 仍为 null。

## 示例
EPLC_EXAMINATION CREATE 5000 → internal memo voucher amount 5000，且 `accountEntries=null`。

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
