---
knowledge_id: functionstrategy-flags-by-function-code-function-strategy-ts
title: "FunctionStrategy 各功能代码的标志位（function-strategy.ts）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
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

## Related Knowledge

- Angular Business Function Catalog (Strategy/Policy/Rules)
- [[Business-Rule-Index]]
