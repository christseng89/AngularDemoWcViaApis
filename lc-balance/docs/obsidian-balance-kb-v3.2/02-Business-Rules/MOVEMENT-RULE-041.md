---
knowledge_id: MOVEMENT-RULE-041
title: "超出可用额度的面额/上限减少会被硬性拒绝，绝不会被静默裁剪 — 一笔被拒绝的 AMEND_DECREASE 会使合约余额保持可验证的不变"
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

# MOVEMENT-RULE-041 — 超出可用额度的面额/上限减少会被硬性拒绝，绝不会被静默裁剪 — 一笔被拒绝的 AMEND_DECREASE 会使合约余额保持可验证的不变

## Status
CONFIRMED

## Business Rule
一笔会使面额或上限降到零/可用额度以下的 AMEND_DECREASE（进口）或负金额 AMEND（出口），会以 409 被拒绝，而不是被裁剪到允许的最大减少幅度——在这样的尝试之后，该合约的余额是可验证不变的（通过被拒绝后的快照进行了验证）。

## Conditions
movementType=AMEND_DECREASE（或 B2 自身的负号 AMEND），其幅度超出所校验的额度

## Result
createMovement 返回非 2xx 状态；随后的快照证明余额相较于被拒绝步骤之前保持不变

## Example
import-case-5：LC 开立 100,000 -> AMEND_DECREASE 120,000 -> 409；快照确认 LC 仍为 110,000，『被拒绝的修改从未生效』

## Verification Note
本轮未直接重新阅读，但与其他各处已确认的『动账不可变』不变式（动账从不会被部分应用）以及上文已独立验证的 export-case-10 数据直接一致；维持 CONFIRMED。

## Source Evidence

Implementation:
- `backend/data/businessCases.js:448-489,2258-2315`

Tests:
- `backend/test/businessCases.test.js:39-42`

## Related Knowledge
- [[BalanceMovement]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
