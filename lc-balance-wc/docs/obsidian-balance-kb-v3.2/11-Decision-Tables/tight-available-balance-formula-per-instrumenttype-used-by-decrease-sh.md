---
knowledge_id: tight-available-balance-formula-per-instrumenttype-used-by-decrease-sh
title: "按 instrumentType 划分的 Tight Available Balance 公式（供减少形态充足性检查使用）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 按 instrumentType 划分的 Tight Available Balance 公式（供减少形态充足性检查使用）

| instrumentType | 公式 | 备注 |
|---|---|---|
| IPLC_LC / EPLC_LC | confirmedBalance − pendingDecreaseTotal − offBalanceExposure(SHGT movements) | 已对 SHGT 敞口做净额处理 |
| EPLC_CONFIRMATION | confirmedBalance − pendingDecreaseTotal − presentDocsEarmark(examination movements) | 刻意采用 STRICT（严格）口径——不像 assembleSnapshot() 自身的展示数字那样享有临时性占用抵扣的覆写 |
| 其他任何 instrumentType | availableBalance（即 ctx.availableBalance，不作修改） | 兜底逻辑——不进行额外的净额处理 |

## Source Evidence

- `microservices/balance-component/src/service/balanceService.ts lines 264-283`

## Related Knowledge

- [[Close Eligibility|SHGT/Acceptance Redemption、Amend Decrease、Close 资格判定]]
- [[Business-Rule-Index]]
