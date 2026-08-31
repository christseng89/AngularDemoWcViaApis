---
knowledge_id: movement-direction-by-instrument-movementtype
title: "MOVEMENT_DIRECTION 按 instrument / movementType 划分"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# MOVEMENT_DIRECTION 按 instrument / movementType 划分

| Instrument group（工具分组） | movementType | Direction（方向） | Balance effect（余额影响） |
|---|---|---|---|
| IPLC_LC / EPLC_LC | ISSUE | +1 | 增加 |
| IPLC_LC / EPLC_LC | AMEND_INCREASE | +1 | 增加 |
| IPLC_LC / EPLC_LC | AMEND_DECREASE | -1 | 减少 |
| IPLC_LC / EPLC_LC | UTILIZE | -1 | 减少 |
| IPLC_ACCEPTANCE / EPLC_ACCEPTANCE | CREATE | +1 | 增加 |
| IPLC_ACCEPTANCE / EPLC_ACCEPTANCE | PARTIAL_SETTLE | -1 | 减少 |
| IPLC_ACCEPTANCE / EPLC_ACCEPTANCE | FULL_SETTLE | -1 | 减少 |
| SHGT | PARTIAL_REDEEM | -1 | 减少 |
| SHGT | FULL_REDEEM | -1 | 减少 |
| EPLC_CONFIRMATION | AMEND | +1 | 增加（CONF_LIAB 通过 ISSUE 建立；根据源码注释，AMEND 本身即被视为增额类 movementType） |
| EPLC_CONFIRMATION | HONOUR | -1 | 减少（即期结算时的永久性减少） |
| EPLC_CONFIRMATION | ACCEPT | -1 | 减少（远期承兑时的永久性减少；同时在别处触发关联的 EPLC_ACCEPTANCE CREATE） |
| EPLC_DUE_FROM_ISSUING_BANK / EPLC_ACCEPTANCE_REIMB_RECEIVABLE / EPLC_EXPORT_BILLS_DISCOUNTED | REIMBURSE | -1 | 减少（冲销该资产） |
| EPLC_DUE_FROM_ISSUING_BANK / EPLC_ACCEPTANCE_REIMB_RECEIVABLE / EPLC_EXPORT_BILLS_DISCOUNTED | RECLASSIFY_OUT | -1 | 减少（冲销该资产） |
| IPLC_LC / EPLC_LC / EPLC_CONFIRMATION | CLOSE | -1 | 减少（A10/B6 冲销剩余 Confirmed Balance） |
| 任意 | CANCEL、EXPIRE、REVERSAL | 未列入本表 | 在 balanceDerivation.ts 的任何函数中使用这些 movementType 均会抛出异常——刻意尚未映射（详见差距说明） |

## Source Evidence

- `microservices/balance-component/src/domain/balanceDerivation.ts lines 1-49`

## Related Knowledge

- Balance Derivation, Status Transition, Tenor Routing
- [[Business-Rule-Index]]
