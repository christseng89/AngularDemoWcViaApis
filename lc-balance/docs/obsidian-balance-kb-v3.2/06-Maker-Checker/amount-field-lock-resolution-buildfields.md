---
knowledge_id: amount-field-lock-resolution-buildfields
title: "Amount 字段锁定解析（buildFields）"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# Amount 字段锁定解析（buildFields）

buildFields() 如何判定 Amount 输入框是禁用、可编辑但有上限、还是完全可编辑，以及从 6 种提示文案中选出哪一种——按照源代码逐条判断条件的优先顺序呈现。

```mermaid
flowchart TD
  A["buildFields() resolves Amount field"] --> B{"settlesDocumentArrival\nAND selectedPayMovement set?\n(A6/B4)"}
  B -- Yes --> B1["LOCKED — 'carried from the\nDocument Arrival, protected'"]
  B -- No --> C{"amountVsAvailableDerivation\n!== SETTLE AND\nmovementType === FULL_SETTLE\nAND snapshot resolved? (A7)"}
  C -- Yes --> C1["LOCKED — 'Full Settle — carried\nfrom Available Balance, protected'"]
  C -- No --> D{"amountVsAvailableDerivation\n=== REDEEM AND\nsnapshot resolved? (A9)"}
  D -- Yes --> D1["LOCKED — 'Full Redeem only —\ncarried from SG Available Balance'"]
  D -- No --> E{"amountAutoFilledFrom\n=== confirmedBalance AND\nsnapshot resolved? (A10/B6)"}
  E -- Yes --> E1["LOCKED — 'Close — carried from\nConfirmed Balance, writes off to 0'"]
  E -- No --> F{"amountVsAvailableDerivation\n=== SETTLE AND\ninstrumentType === EPLC_ACCEPTANCE\nAND snapshot resolved? (B5)"}
  F -- Yes --> F1["EDITABLE, capped at Available —\n'reduce for a Partial Settle'"]
  F -- No --> G{"compoundSubmission includes\ndocumentArrivalWithSg? (A3S)"}
  G -- Yes --> G1["EDITABLE — 'Bill Amount\n(actual document amount)'"]
  G -- No --> H["EDITABLE — 'Amount (face-level,\nper Design doc §6.2)'"]
```

## Source Evidence

- `builder-fields.ts:24-102`

## Related Knowledge

- Angular 业务功能目录（Strategy/Policy/Rules）
- [[Business-Rule-Index]]
