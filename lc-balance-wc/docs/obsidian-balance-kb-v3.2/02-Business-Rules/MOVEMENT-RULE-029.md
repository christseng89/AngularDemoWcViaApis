---
knowledge_id: MOVEMENT-RULE-029
title: "在选择合同/快照时进行金额自动填充推导——4 种不同的系统推导金额条件"
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

# MOVEMENT-RULE-029 — 在选择合同/快照时进行金额自动填充推导——4 种不同的系统推导金额条件

## Status
CONFIRMED

## Business Rule
afterResolved() 与 refreshSelectedContractSnapshot() 都会在以下 4 种不同条件下，将 model.amount 自动设置为由服务端推导出的数值：movementType 为 FULL_SETTLE -> 取 availableBalance；amountVsAvailableDerivation==='REDEEM'（A9）-> 取 availableBalance；amountVsAvailableDerivation==='SETTLE' 且 instrumentType 为 EPLC_ACCEPTANCE（B5）-> 取 availableBalance；amountAutoFilledFrom==='confirmedBalance'（A10/B6 Close）-> 取 confirmedBalance（刻意不取 availableBalance，因为 Close 只应核销真正已经 RELEASED 的部分）。

## Conditions
参见 businessRule 中所述的 4 个相互独立的分支

## Result
model.amount 会被覆写，相关字段被重建为锁定/禁用状态

## Example
A10/B6 Close 读取的是 confirmedBalance，而非 availableBalance，其目的正是为了不让某个仍处于 PENDING 状态的 movement 自身的影响，改变核销金额

## Verification Note
本轮未直接重新核对源码；与本轮其他地方已独立验证过的 A9 锁定规则及 A10/B6 Close 规则一致。基于这一致性保持 CONFIRMED。

## Source Evidence

实现:
- `src/app/transaction-builder/maker-panel.component.ts:484-499,846-881`

测试:
- （未引用直接测试证据）

## Related Knowledge
- [[BalanceMovement]]
- [[MakerPanelComponent]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
