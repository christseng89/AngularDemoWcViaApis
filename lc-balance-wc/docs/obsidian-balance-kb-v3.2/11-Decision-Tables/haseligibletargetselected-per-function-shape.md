---
knowledge_id: haseligibletargetselected-per-function-shape
title: "hasEligibleTargetSelected 按功能形态（Function Shape）的判定逻辑"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# hasEligibleTargetSelected 按功能形态（Function Shape）的判定逻辑

| Function shape（功能形态） | Example code(s)（示例代码） | False until…（在此之前为 false） | True once…（一旦满足即为 true） |
|---|---|---|---|
| 创建类，无父级 | A1、B1 | 不适用——始终豁免 | 无论选择状态如何始终为 true |
| 完全未选择 selectedFunction | 任意 | selectedFunction 为 null | 不适用（始终为 false） |
| 创建类 + hasParent | A6、A8、B3 | selectedParent 尚未选定 | selectedParent 已选定（A6 另有下述进一步限制） |
| releasesExistingMovementInPlace | A4 | selectedPayMovement 尚未选定 | selectedPayMovement 已选定 |
| settlesDocumentArrival，创建类 | A6 | selectedParent 及/或 selectedPayMovement 尚未选定 | selectedParent 与 selectedPayMovement 均已选定 |
| settlesDocumentArrival，非创建类 | B4 | selectedContract 及/或 selectedPayMovement 尚未选定 | selectedContract 与 selectedPayMovement 均已选定 |
| documentArrivalWithSg | A3S | selectedArrivalSg 或 arrivalSgSnapshot 缺失 | selectedArrivalSg 与 arrivalSgSnapshot 均已解析完成 |
| amountVsAvailableDerivation 为 REDEEM | A9 | selectedContractSnapshot 尚未解析 | selectedContractSnapshot 已解析 |
| amountVsAvailableDerivation 为 SETTLE + EPLC_ACCEPTANCE | B5 | selectedContractSnapshot 尚未解析 | selectedContractSnapshot 已解析 |
| 其余所有非创建类功能 | A2、A3、A7、B2 | selectedContract 尚未选定 | selectedContract 已选定 |

## Source Evidence

- `submit-rules.ts:219-249`
- `submit-rules.spec.ts:652-742`

## Related Knowledge

- Angular Business Function Catalog (Strategy/Policy/Rules)
- [[Business-Rule-Index]]
