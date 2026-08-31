---
knowledge_id: validatesubmit-guard-chain-in-evaluated-order
title: "validateSubmit() 守卫链（按评估顺序）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# validateSubmit() 守卫链（按评估顺序）

| 顺序 | 守卫条件 | 适用范围 | 失败信息（或产生的效果） |
|---|---|---|---|
| 1 | instrumentType/movementType/amount/currency/createdBy 全部存在 | 所有功能 | "Fill in amount, currency, createdBy." |
| 2 | amountExceedsCurrencyDecimals(amount, currency) | 所有功能 | "Amount {amount} has more decimal places than {CCY} allows ({n})." |
| 3 | Number(amount) <= 0，但 movementType === 'CLOSE' 除外 | 除 A10/B6 之外的所有功能 | "Amount must be greater than 0." |
| 4 | dynamicSecondaryRefLabel 已设置 且 !secondaryRef | 每个具有次要参照标签的功能（除 A1/B1 外全部） | "{label} is mandatory for {code}." |
| 5 | isCreatingMovement 且 instrumentType==='SHGT' 且 !naturalKey.sgNumber | A8 | "SG Number is mandatory when issuing a Shipping Guarantee." |
| 6 | lcNumberFromParent 且 !naturalKey.lcNumber | A6、A8、B3（LC Number 来自 Parent 的场景） | "Pick the Parent LC first — that selection supplies this record's LC Number." |
| 7 | isCreatingMovement 且 !lcNumberFromParent 且 !naturalKey.lcNumber | A1、B1 | "LC Number is mandatory." |
| 8 | requiredNaturalKeyFields 包含 'ibNumber' 且 isCreatingMovement 且 !naturalKey.ibNumber | A6（进口，IB Number） | "{IB Number|EB Number} is mandatory." |
| 9 | tenorTypeOptions.length 且 !model.tenorType | A1、A6、A7（catalogTenorFilter）、B1、B4 | "Tenor Type is mandatory for {code}." |
| 10 | code === 'A1'：Sight 强制将 tenorDays 补丁为 0；Usance 要求 tenorDays>0 | 仅 A1——另见关于 B1 的 CONFLICT 发现 | "Tenor Days must be greater than 0 for Seller's/Buyer's Usance."（仅 Usance 分支） |
| 11 | settlesDocumentArrival 且 !selectedPayMovement | A6、B4 | "Pick the still-PENDING {pendingItemLabel} (2ndary Index) to convert first." |
| 12 | compoundSubmission 包含 'documentArrivalWithSg' 且 (!selectedArrivalSg 或 !arrivalSgSnapshot) | A3S | "Pick the Shipping Guarantee this Document Arrival is against first." |
| 13 | amountVsAvailableDerivation === 'REDEEM' | A9 | 无快照时："Search for the Shipping Guarantee to redeem first."；金额不等于可用余额时："...must be for the FULL Available Balance ({available})..."；否则将 patch.movementType 设为 'FULL_REDEEM' |
| 14 | amountVsAvailableDerivation === 'SETTLE' 且 instrumentType==='EPLC_ACCEPTANCE' | B5 | 无快照时："Search for the Acceptance to settle first."；金额超过可用余额时："Amount must not exceed the Acceptance's Available Balance ({available})."；否则将 patch.movementType 设为 FULL_SETTLE 或 PARTIAL_SETTLE |
| 15 | subChoice.key === 'amendDirection' 且 !amendDirection | B2 | "Pick Increase or Decrease for this Amendment." |
| 16 | 所有守卫均通过 | 所有功能 | {error: null, patch} |

## Source Evidence

- `submit-rules.ts:55-158`
- `submit-rules.spec.ts:92-419`

## Related Knowledge

- Angular Business Function Catalog (Strategy/Policy/Rules)
- [[Business-Rule-Index]]
