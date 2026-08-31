---
knowledge_id: MOVEMENT-RULE-021
title: "A3S 基于单据匹配的 SG 赎回，是 A9 仅限 Full-Redeem 规则的唯一合法例外——通过 businessEventId 关联到可识别单据的真正 PARTIAL_REDEEM"
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

# MOVEMENT-RULE-021 — A3S 基于单据匹配的 SG 赎回，是 A9 仅限 Full-Redeem 规则的唯一合法例外——通过 businessEventId 关联到可识别单据的真正 PARTIAL_REDEEM

## Status
CONFIRMED

## Business Rule
A3S（单据到达 + Shipping Guarantee，一种复合型 Maker 提交）仍然可以产生针对某个 SG 的 PARTIAL_REDEEM，原因在于其赎回金额与一组具体、可识别的到达单据相关联（取 MIN(单据/提单金额, SG Outstanding) 中的较小者），而非 Maker 随意输入的数字，并且通过共享的 businessEventId 与其配对的 IPLC_LC UTILIZE 相关联，二者总是一同 release，或在自动回滚时一同回滚。

## Conditions
功能为 A3S（documentArrivalWithSg 复合提交）

## Result
根据情况产生 PARTIAL_REDEEM 或 FULL_REDEEM，并与配对的 UTILIZE 共享 businessEventId

## Example
import-case-6/B02：提单金额 12,000，对比 SG2 Outstanding 20,000 -> PARTIAL_REDEEM 12,000（backend/data/businessCases.js:604-609）

## Verification Note
已直接阅读 businessCases.js 中 MIN() 赎回相关代码；与声明的公式及用例数据完全一致。已将来自 design-docs-figures-mapping 的重复表述（『A3S 赎回段以 MIN(Bill Amount, SG Available Balance) 为上限……』）合并入本条目。

## Source Evidence

实现:
- `backend/data/businessCases.js:396-412,571-618,708-737,893-923`

测试:
- `backend/data/businessCases.js 各处的用例标签内联文字，已明确说明该公式`

## Related Knowledge
- [[BalanceMovement]]
- SG 赎回金额 = MIN(Bill Amount, SG Outstanding)
- A9 SG 赎回仅限 Full Redeem
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
