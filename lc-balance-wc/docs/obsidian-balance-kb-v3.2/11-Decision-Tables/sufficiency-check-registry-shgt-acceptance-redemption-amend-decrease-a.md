---
knowledge_id: sufficiency-check-registry-shgt-acceptance-redemption-amend-decrease-a
title: "充足性检查注册表——SHGT/Acceptance Redemption、AMEND_DECREASE 与 Close（范畴相关子集）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 充足性检查注册表——SHGT/Acceptance Redemption、AMEND_DECREASE 与 Close（范畴相关子集）

| movementType | 适用的金融工具 | movementTypeRegistry 中的处理器 | 比较基准 |
|---|---|---|---|
| AMEND_DECREASE | IPLC_LC / EPLC_LC（A2） | decreaseShaped -> checkAmendDecreaseSufficiency | Tight Available Balance |
| AMEND（ceilingAmount 为负数 = 减少方向） | EPLC_CONFIRMATION（B2） | amendShaped（以 ceilingAmount.isNegative() 为门槛条件） -> checkAmendDecreaseSufficiency | Tight Available Balance |
| AMEND（ceilingAmount 为正数 = 增加方向） | EPLC_CONFIRMATION（B2） | amendShaped -> noCheck（返回 null） | 不适用 |
| PARTIAL_REDEEM / FULL_REDEEM | SHGT | outstandingCapped -> checkRedeemSufficiency | Available Balance |
| PARTIAL_SETTLE / FULL_SETTLE | IPLC_ACCEPTANCE / EPLC_ACCEPTANCE | outstandingCapped -> checkRedeemSufficiency | Available Balance |
| REIMBURSE / RECLASSIFY_OUT | 资产侧保兑类金融工具（EPLC_DUE_FROM_ISSUING_BANK / EPLC_ACCEPTANCE_REIMB_RECEIVABLE / EPLC_EXPORT_BILLS_DISCOUNTED） | outstandingCapped -> checkRedeemSufficiency | Available Balance |
| CLOSE | IPLC_LC / EPLC_LC / EPLC_CONFIRMATION（仅限根合约） | closeShaped -> evaluateContractCloseEligibility + 精确金额匹配检查 | 资格条件 + 与 Confirmed Balance 精确匹配 |

## Source Evidence

- `microservices/balance-component/src/service/balanceService.ts lines 185-254`

## Related Knowledge

- [[Close Eligibility|SHGT/Acceptance Redemption、Amend Decrease、Close 资格判定]]
- [[Business-Rule-Index]]
