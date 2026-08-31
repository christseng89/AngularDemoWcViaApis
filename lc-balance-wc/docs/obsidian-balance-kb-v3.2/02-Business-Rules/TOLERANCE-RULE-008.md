---
knowledge_id: TOLERANCE-RULE-008
title: "checkUtilizeSufficiency/checkShgtIssueSufficiency/checkPresentDocsIssueSufficiency 中采用的从严可用余额公式（'增加從嚴，占用從寬'）"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - tolerance
  - confirmed
---

# TOLERANCE-RULE-008 — checkUtilizeSufficiency/checkShgtIssueSufficiency/checkPresentDocsIssueSufficiency 中采用的从严可用余额公式（"增加從嚴，占用從寬"）

## Status
CONFIRMED

## Business Rule
tightAvailableBalance 是由 confirmedBalance（仅计入 RELEASED 状态）推导得出，因此仍处于 PENDING 的 ISSUE/AMEND_INCREASE 永远不会提升该数值（"增加從嚴"——只有已获 Approve 的金额才计入可用容量）。而仍处于 PENDING 的 AMEND_DECREASE/UTILIZE 等（pendingDecreaseTotal）则会在其自身获得 Checker 核准之前就立即被扣减（"占用從寬"——占用是从宽、立即计算的）。

## Conditions
统一适用于 checkUtilizeSufficiency、checkShgtIssueSufficiency 与 checkPresentDocsIssueSufficiency 各自的 tightAvailable 公式内部（confirmedBalance − pendingDecreaseTotal [− offBalanceExposure|existingShgtExposure|presentDocsEarmark]）。

## Result
一笔刚提交、仍处于 PENDING 状态的全新 A1 ISSUE（availableBalance=10, confirmedBalance=0）在其自身获得 Checker 核准之前完全无法被动用（tightAvailableBalance=0）。

## Example
requestedAmount=10, availableBalance=10, confirmedBalance=0 → 拒绝，"exceeds Tight Available Balance 0"

## Verification Note
已对照源码与测试文件完整验证——公式及所引用的所有测试场景均完全一致。重要分类提示：本规则实际上与容差/Ceiling 转换或外汇/币别处理完全无关——它是一条从严可用余额（Tight Available Balance）/表外风险敞口充分性检查规则，依所述分类法应归属 EXPOSURE-RULE 或 BALANCE-RULE，而非 TOLERANCE-RULE。鉴于证据充分，维持 CONFIRMED，但标记为归类错误（mistagged-domain），而非基于证据不足而降级。

## Source Evidence

Implementation:
- `microservices/balance-component/src/domain/offBalanceExposure.ts:298 (verified: tightAvailableBalance = confirmedBalance.minus(pendingDecreaseTotal).minus(offBalanceExposure))`

Tests:
- `microservices/balance-component/test/unit/domain/offBalanceExposure.test.ts:146-178 (checkUtilizeSufficiency PENDING increase/decrease cases, verified)`
- `microservices/balance-component/test/unit/domain/offBalanceExposure.test.ts:225-248 (checkShgtIssueSufficiency PENDING increase/decrease cases, verified)`
- `microservices/balance-component/test/unit/domain/offBalanceExposure.test.ts:286-297 (checkPresentDocsIssueSufficiency PENDING decrease case, verified)`

## Related Knowledge
- [[Tolerance Processing]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
