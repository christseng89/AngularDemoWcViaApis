---
knowledge_id: a10-b6-close-eligibility-gate-and-write-off-flow
title: "A10/B6 Close——资格判定关卡与核销流程"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# A10/B6 Close——资格判定关卡与核销流程

两道防线（createMovement() 自身的充足性检查，以及 release() 自身的复检）都调用同一个共享的 evaluateContractCloseEligibility()，因此选择器的提示、Submit 时的检查与 Release 时的复检永远不会出现分歧。金额从不由人工输入——它在检查发生的当下自动从 Confirmed Balance 派生并锁定。

```mermaid
flowchart TD
  A[Maker 在一份 ACTIVE 合约上选择 A10/B6 Close] --> B{closeEligibility 检查：\nSG Balance = 0？\n（仅限 Import）}
  B -- 否 --> R1[409 INSUFFICIENT_AVAILABLE_BALANCE\n“SG Balance 必须为 0”]
  B -- 是 / Export 不适用 --> C{Acceptance Balance = 0？\n（两侧均适用）}
  C -- 否 --> R2[409 INSUFFICIENT_AVAILABLE_BALANCE\n“Acceptance Balance 必须为 0”]
  C -- 是 --> D{整棵树中\n是否无未结事件？\n（含已 RELEASED 但尚未\n消耗的 B3 Present Docs）}
  D -- 否 --> R3[409——存在未结事件，阻止 Close]
  D -- 是 --> E{合约尚未\n处于 CLOSED？}
  E -- 否 --> R4[409——已处于关闭状态]
  E -- 是 --> F[金额自动填入 = 当前\nConfirmed Balance，并锁定]
  F --> G[Maker Submit——createMovement，\n重新执行同一资格检查]
  G --> H[Checker Release]
  H --> I{自 Submit 以来\n余额是否未变？复检\n资格与金额是否匹配}
  I -- 否，余额已漂移 --> R5[拒绝——强制重新提交，\n绝不静默地多写或少写]
  I -- 是 --> J[Confirmed Balance -> 0\nContractStatus -> CLOSED]
```

## 相关知识

- Quality/Remediation History Docs
- [[Business-Rule-Index]]
