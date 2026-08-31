---
knowledge_id: document-arrival-utilize-sufficiency-check-with-shgt-off-balance-netti
title: "Document Arrival（UTILIZE）充分性检查与 SHGT 表外净额处理"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# Document Arrival（UTILIZE）充分性检查与 SHGT 表外净额处理

Maker 提交的 Document Arrival（普通 A3，或 A3S「含 Shipping Gtee 的提货文件到单」）如何针对母信用证的额度进行检查，包括刻意设计的 matched-businessEventId 例外——它让 A3S 提交能在信用证侧的检查真正运行之前，先行净额计入自身的 SG 赎回。

```mermaid
flowchart TD
  A["Maker 提交 Document Arrival（UTILIZE）"] --> B{"A3S：是否匹配到特定的 SG？"}
  B -- "是（A3S）" --> C["先创建 SG 自身的 PARTIAL_REDEEM/FULL_REDEEM（PENDING），与该 UTILIZE 共享 businessEventId"]
  C --> D["computeOffBalanceExposure(shgtMovements, matchedPendingUtilizeBusinessEventIds)"]
  B -- "否（普通 A3）" --> D
  D --> E["offBalanceExposure = Σ RELEASED ISSUE + Σ PENDING ISSUE − Σ RELEASED redeems − Σ matched-PENDING redeems"]
  E --> F["checkUtilizeSufficiency(requestedAmount, availableBalance, confirmedBalance, pendingDecreaseTotal, offBalanceExposure)"]
  F --> G{"requestedAmount > availableBalance？"}
  G -- 是 --> H["ERROR：超过 Available Balance"]
  G -- 否 --> I["tightAvailable = confirmedBalance − pendingDecreaseTotal − offBalanceExposure"]
  I --> J{"requestedAmount > tightAvailable？"}
  J -- 是 --> K["ERROR：超过 Tight Available Balance（v0.12 硬性拒绝）— 若未匹配则建议改用 A3S"]
  J -- 否 --> L["OK — createMovement() 继续执行"]
  L --> M["deriveContingentAccountEntry(IPLC_LC/EPLC_LC, UTILIZE, tenorType) -> Dr/Cr 分录以不可变方式持久化存储"]
```

## 相关知识

- [[Off-Balance-Sheet Exposure|表外风险敞口与或有负债科目分录]]
- [[Business-Rule-Index]]
