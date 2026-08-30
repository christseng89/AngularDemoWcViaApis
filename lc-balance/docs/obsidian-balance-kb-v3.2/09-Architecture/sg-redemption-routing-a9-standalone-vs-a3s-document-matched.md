---
knowledge_id: sg-redemption-routing-a9-standalone-vs-a3s-document-matched
title: "SG 赎回路由——A9 独立入口 vs. A3S 单据匹配入口"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# SG 赎回路由——A9 独立入口 vs. A3S 单据匹配入口

两个结构上截然不同的入口都会产生 SHGT 赎回动账，但只有其中一个受 BA 确认的“仅限全额赎回（Full-Redeem-only）”锁定约束；例外情形（A3S）之所以正当，是因为它透过与配对的 LC UTILIZE 共享同一个 businessEventId，形成了真实、可追溯的单据匹配。

```mermaid
flowchart TD
  A[SG Redemption needed] --> B{Entry point?}
  B -- A9, standalone screen --> C[Amount field LOCKED\n= SG Available Balance]
  C --> D[movementType hard-coded\nFULL_REDEEM only]
  D --> E[Submit -> Checker Release]
  B -- A3S, compound with\nDocument Arrival --> F[Amount = MIN(Document Amount,\nSG Outstanding)]
  F --> G{Amount fully\ncovers Outstanding?}
  G -- Yes --> H[FULL_REDEEM,\nshares businessEventId\nwith paired UTILIZE]
  G -- No --> I[PARTIAL_REDEEM,\nshares businessEventId\nwith paired UTILIZE]
  H --> J[Submit both legs together\n-> auto-rollback if either fails]
  I --> J
```

## Related Knowledge

- Quality/Remediation History Docs
- [[Business-Rule-Index]]
