---
knowledge_id: a10-b6-close-submit-through-release-lifecycle
title: "A10/B6 Close——从 Submit 到 Release 的生命周期"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# A10/B6 Close——从 Submit 到 Release 的生命周期

A10（Import LC Close）/ B6（Export Confirmed LC Close）完整的三层防护：一个共享的资格检查（eligibility check）会同时把关 Step-1 picker（图中未展示）、Maker Submit 与 Checker Release；核销金额在 Submit 与 Release 时都必须精确匹配 Confirmed Balance。

```mermaid
flowchart TD
  A[Maker：金额根据当前 Confirmed Balance 自动推导] --> B[POST /balance-movements CLOSE]
  B --> C{根 instrumentType？\nIPLC_LC / EPLC_LC / EPLC_CONFIRMATION}
  C -- No --> C1[InsufficientBalanceError：\ninstrumentType 不符合资格]
  C -- Yes --> D[evaluateContractCloseEligibility]
  D --> E{SG=0 且 Acceptance=0\n且整棵树中没有任何未结事件（open events）\n且尚未 Closed？}
  E -- No --> E1[InsufficientBalanceError：\n拼接所有未通过原因]
  E -- Yes --> F{ceilingAmount ==\n当前 Confirmed Balance？}
  F -- No --> F1[InsufficientBalanceError：\n金额必须精确等于 Confirmed Balance]
  F -- Yes --> G[创建 Movement，状态为 PENDING]
  G --> H[Checker：POST .../release]
  H --> I[重新执行 evaluateContractCloseEligibility\n（排除本笔 movement）]
  I --> J{是否仍然符合资格？}
  J -- No --> J1[IllegalStateTransitionError：\n资格条件已不再成立]
  J -- Yes --> K{ceilingAmount ==\n此刻当前的 Confirmed Balance？}
  K -- No --> K1[IllegalStateTransitionError：\nConfirmed Balance 自 Submit 后已发生变化]
  K -- Yes --> L[updateStatus：RELEASED]
  L --> M[markClosed 合约\n-> ContractStatus = CLOSED]
  M --> N[合约不再能通过\n仅限 ACTIVE 的 natural-key 查询解析到；\n但通过 includeAnyStatus 仍可用于查询解析]
```

## 证据来源

- `microservices/balance-component/src/domain/closeEligibility.ts`
- `microservices/balance-component/src/service/balanceService.ts lines 200-230, 413-467, 1159-1266`

## 相关知识

- [[Close Eligibility|SHGT/Acceptance 赎回、Amend Decrease、Close 资格]]
- [[Business-Rule-Index]]
