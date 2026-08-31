---
knowledge_id: MOVEMENT-RULE-037
title: "SG 赎回金额 = MIN(单据到单/汇票金额, SG 未偿余额)"
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

# MOVEMENT-RULE-037 — SG 赎回金额 = MIN(单据到单/汇票金额, SG 未偿余额)

## Status
CONFIRMED

## Business Rule
针对一笔已匹配（A3S）提示单据的 Shipping Guarantee，其入账的赎回金额取到达的汇票/单据金额与该 SG 自身当前未偿余额两者中的较小值——当该 SG 因此被完全消耗时为 FULL_REDEEM，否则为 PARTIAL_REDEEM。

## Conditions
A3S 将单据到单与一笔已知未偿余额的 SG 相匹配

## Result
redeem.amount = MIN(bill.amount, sg.outstanding)；当 redeem.amount == sg.outstanding 时 movementType = FULL_REDEEM，否则为 PARTIAL_REDEEM

## Example
import-case-7/8：汇票 25,000 对比 SG 未偿余额 20,000 -> FULL_REDEEM 20,000。import-case-6/B02：汇票 12,000 对比 SG2 未偿余额 20,000 -> PARTIAL_REDEEM 12,000

## Verification Note
已通过对 businessCases.js 的 grep 直接确认——在引用的案例数据处逐字找到了确切的 MIN() 标注以及 FULL_REDEEM/PARTIAL_REDEEM 结果。

## Source Evidence

Implementation:
- `backend/data/businessCases.js:396-412,571-618,708-737,893-923`

Tests:
- `backend/data/businessCases.js 自身内联的案例标注在各处明确写明了该公式`

## Related Knowledge
- [[BalanceMovement]]
- SG Redemption Amount = MIN(Bill Amount, SG Outstanding)
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
