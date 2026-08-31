---
knowledge_id: a10-b6-close-eligibility-gate-at-submit-and-approve
title: "A10/B6 — Submit 与 Approve 时的 Close 资格闸门"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# A10/B6 — Submit 与 Approve 时的 Close 资格闸门

CLOSE 会冲销剩余的 Confirmed Balance 并终止该逻辑合约（Logical Contract），但前提是资格条件在 Submit 与 Approve 两个时点都必须成立——因为在这两者之间的窗口期，资格条件是有可能不再成立的。

```mermaid
flowchart TD
  A[Maker 开启 A10/B6] --> B{是否符合资格？<br/>尚未 Closed 且<br/>SG/Acceptance Confirmed Balance = 0 且<br/>树中不存在任何未结 Event}
  B -->|否| C[在选择器自身的候选提示集中不可选取]
  B -->|是| D[金额自动带入 = 当前 Confirmed Balance，并锁定]
  D --> E[Maker Submit CLOSE，进入 PENDING]
  E --> F[重新检查：金额是否仍精确等于 Confirmed Balance？资格是否仍成立？]
  F -->|否 — 余额/资格已发生偏移| G[409 — Maker 必须重新 Submit]
  F -->|是| H[Submit 时：Available -= ceilingAmount，Tight -= ceilingAmount]
  H --> I[Checker 审核]
  I --> J[Checker Release]
  J --> K{资格与精确金额是否重新验证通过？}
  K -->|否| L[Release 直接失败 — 不会悄悄改用另一个冲销金额重新推算]
  K -->|是| M[Confirmed Balance -= ceilingAmount，精确降至 0<br/>ContractStatus：ACTIVE -> CLOSED]
```

## 来源证据

- `Balance-Figures-Calculation-Logic.txt lines 128-141 (banner)`
- `Balance-Figures-Calculation-Logic.txt lines 925-974 (A10)`
- `Balance-Figures-Calculation-Logic.txt lines 1260-1306 (B6)`

## 相关知识

- Balance Figures Calculation Logic + TF Balance Component Mapping Workbook
- [[Business-Rule-Index]]
