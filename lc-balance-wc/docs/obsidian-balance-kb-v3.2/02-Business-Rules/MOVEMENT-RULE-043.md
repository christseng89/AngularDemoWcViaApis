---
knowledge_id: MOVEMENT-RULE-043
title: "A3 与 A3S — movementType 完全相同（均为 UTILIZE），区别仅在于是否显式匹配了一笔未偿的 SG"
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

# MOVEMENT-RULE-043 — A3 与 A3S — movementType 完全相同（均为 UTILIZE），区别仅在于是否显式匹配了一笔未偿的 SG

## Status
CONFIRMED

## Business Rule
A3（单据到单，没有占用 LC 额度的未偿 Shipping Guarantee）与 A3S（带 Shipping Gtee 的单据到单，会显式匹配一笔 SG）在底层其实是同一个 movementType（UTILIZE），之所以对外暴露为两个不同的 functionCode，纯粹是为了让渠道客户端能够选择正确的一个。A3S 额外需要一次两环节的复合提交（先做 SG 赎回，再做 LC 的 UTILIZE）；A3 则是单一环节。

## Conditions
两者的 instrumentType 均为 IPLC_LC

## Result
A3S 额外需要两环节的复合提交；A3 为单一环节

## Example
不适用

## Verification Note
本轮未直接重新阅读，但与已独立验证过的 A3S MIN() 赎回/businessEventId 配对规则以及领域模型中两者共用同一 UTILIZE movementType 的设定完全一致；维持 CONFIRMED。

## Source Evidence

Implementation:
- `analysis/balance-component-channel-api.yaml:310-315,855-876`

Tests:
- （未引用直接测试证据）

## Related Knowledge
- [[BalanceMovement]]
- Channel compound-leg functions: A3S, B4, B5
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
