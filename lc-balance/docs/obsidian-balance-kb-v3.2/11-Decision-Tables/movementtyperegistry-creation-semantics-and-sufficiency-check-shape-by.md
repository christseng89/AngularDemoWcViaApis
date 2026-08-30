---
knowledge_id: movementtyperegistry-creation-semantics-and-sufficiency-check-shape-by
title: "movementTypeRegistry ——按 movementType 划分的创建语义与充足性检查形态"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# movementTypeRegistry ——按 movementType 划分的创建语义与充足性检查形态

| movementType | isCreating | 适用的充足性检查 | 业务功能 |
|---|---|---|---|
| ISSUE | true | 无（SHGT/EPLC_EXAMINATION 已在更早阶段经 newContractSufficiencyRegistry 检查过；普通 LC ISSUE 则完全没有） | A1/B1，SHGT Issue 的前置动作 |
| CREATE | true | 无（Acceptance CREATE / EPLC_EXAMINATION CREATE——后者已在更早阶段经 newContractSufficiencyRegistry 检查过） | A6/A7 Acceptance、B3 Present Docs |
| AMEND_INCREASE | false | 无 | A2/A7 增加 |
| AMEND | false | amendShaped——仅当 ceilingAmount 为负数时才触发“减少形态”检查 | B2（方向随正负号而定） |
| AMEND_DECREASE | false | decreaseShaped（Tight Available Balance，对 SHGT/Present-Docs 敞口做净额处理） | A2 减少 |
| UTILIZE | false | utilizeShaped（Tight Available Balance，A3S businessEventId 匹配例外） | A3/A3S 单据到达 |
| HONOUR | false | utilizeShaped | B4 Honour |
| ACCEPT | false | utilizeShaped | B4 Accept |
| PARTIAL_REDEEM | false | outstandingCapped（checkRedeemSufficiency 对比 availableBalance） | A9（客户端已锁定为 Full Redeem；API 仍接受该值） |
| FULL_REDEEM | false | outstandingCapped | A9 |
| REIMBURSE | false | outstandingCapped | 出口保兑资产侧偿付 |
| RECLASSIFY_OUT | false | outstandingCapped | CNF_DISCOUNT 转出腿 |
| PARTIAL_SETTLE | false | outstandingCapped | B5 部分结算 |
| FULL_SETTLE | false | outstandingCapped | B5 全部结算 |
| CLOSE | false | closeShaped（经 evaluateContractCloseEligibility 判定资格，且金额须与 Confirmed Balance 精确匹配） | A10/B6 Close |

## Source Evidence

- `balanceService.ts:175-255`

## Related Knowledge

- Maker/Checker Service Orchestration (balanceService.ts)
- [[Business-Rule-Index]]
