---
knowledge_id: functionstrategy-flags-by-function-code-function-strategy-ts
title: "FunctionStrategy 各功能代码的标志位（function-strategy.ts）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-31
tags:
  - balance
  - decision-table
---

# FunctionStrategy 各功能代码的标志位（function-strategy.ts）

| Code | derivesMovementTypeFromTenor | amountVsAvailableDerivation | amountAutoFilledFrom | compoundSubmission.possibleShapes | releasesExistingMovementInPlace | settlesDocumentArrival | sourceAlreadyReleasedBeforePick | deferSettlement | usesSettleableBalanceIndex |
|---|---|---|---|---|---|---|---|---|---|
| A1 | false | null | null | [plain] | false | false | false | false | false |
| A2 | false | null | null | [plain] | false | false | false | false | false |
| A3 | false | null | null | [plain] | false | false | false | true | false |
| A3S | false | null | null | [documentArrivalWithSg] | false | false | false | true | false |
| A4 | false | null | null | [plain] | true | false | false | false | false |
| A6 | false | null | null | [plain] | false | true | false | false | false |
| A7 | false | null | null | [plain] | false | false | false | false | false |
| A8 | false | null | null | [plain] | false | false | false | false | false |
| A9 | false | REDEEM | null | [plain] | false | false | false | false | false |
| A10 | false | null | confirmedBalance | [plain] | false | false | false | false | false |
| B1 | false | null | null | [plain] | false | false | false | false | false |
| B2 | false | null | null | [plain] | false | false | false | false | false |
| B3 | false | null | null | [plain] | false | false | false | false | false |
| B4 | true | null | null | [confirmationHonourWithReceivable, confirmationAcceptWithReceivable] | false | true | true | false | false |
| B5 | false | SETTLE | null | [acceptanceSettleWithReceivable] | false | false | false | false | true |
| B6 | false | null | confirmedBalance | [plain] | false | false | false | false | false |

## Source Evidence

- `function-strategy.ts:104-162`
- `function-strategy.spec.ts:8-101`

## 2026-08-31 — Maker Result Delete Pending policy

`makerResultDeletePending` 將 Transaction Processing 同 session 的 Delete Pending 差異集中在 strategy，避免 component 依 Function Code 分支：

| Function | Operation | Linked movement ids | 成功後畫面 |
|---|---|---|---|
| A1、B1 | `CANCEL` | primary movement | 清空結果並回到新的 natural-key 輸入 |
| A4 | `WITHDRAW_MAKER_SUBMIT` | primary A3／A3S UTILIZE | 回到 A4 Transaction Index；保留 source movement |
| A3S、B4、B5 | `CANCEL` | strategy 定義的 sibling ids，最後 primary | 回到該 Function 的 Transaction Index |
| 其他 A2-A11／B2-B7 | `CANCEL` | primary movement | 回到該 Function 的 Transaction Index |

此 policy 只控制 Transaction Processing 的 Maker Result。Maker Queue／Fix Pending 有自己的入口與狀態，不讀取這個畫面導航 policy。Compound cancel 是依序呼叫單筆 API，不具原子 batch rollback。

## Related Knowledge

- Angular Business Function Catalog (Strategy/Policy/Rules)
- [[Business-Rule-Index]]
