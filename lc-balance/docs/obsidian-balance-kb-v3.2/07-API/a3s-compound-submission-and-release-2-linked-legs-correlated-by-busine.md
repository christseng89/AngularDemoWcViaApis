---
knowledge_id: a3s-compound-submission-and-release-2-linked-legs-correlated-by-busine
title: "A3S 复合提交与放行——两条由 businessEventId 关联的分腿（leg）"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# A3S 复合提交与放行——两条由 businessEventId 关联的分腿（leg）

单据到达搭配 Shipping Guarantee（Document Arrival with Shipping Guarantee）：参考客户端先提交 SG 赎回（redemption）分腿，再提交 LC 自身的 UTILIZE 分腿，两者共享同一个 businessEventId；一个真正独立的 Checker 会话，必须能够在服务端解析出关联的分腿，而不能依赖 Maker 的内存态（in-memory state）（v1.2.0 修复）。

```mermaid
flowchart TD
  M1[Maker：POST SHGT FULL_REDEEM/PARTIAL_REDEEM — 第 1 条 leg，businessEventId=X] --> M2{第 2 条 leg 创建是否成功？}
  M2 -- 否，第 2 条 leg（IPLC_LC UTILIZE）失败 --> RB[客户端自动回滚：对第 1 条 leg 的 SG 赎回调用 POST /cancel]
  M2 -- 是 --> Both[两条 leg 均为 PENDING，共享同一个 businessEventId=X]
  Both --> C1[Checker 会话——可能与 Maker 分离——调用 GET /balance-movements?businessEventId=X]
  C1 --> C2[在服务端解析出两个关联的 movementId]
  C2 --> C3[POST /balance-movements/{sgLegId}/release]
  C3 --> C4[POST /balance-movements/{lcLegId}/release]
  C4 --> Done([两条 leg 均已 RELEASED：SG 的 offBalanceExposure 完成净额结算，LC 的 Confirmed Balance 按 UTILIZE 金额相应减少])
```

## Source Evidence

- `balance-component-api.yaml lines 234-245, 848-853`
- `balance-component-channel-api.yaml lines 865-876`

## Related Knowledge

- OpenAPI Specs — Microservice + Channel API
- [[Business-Rule-Index]]
