---
knowledge_id: acceptance-create-tenor-routing-decision
title: "Acceptance CREATE 的 tenor 路由判定"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# Acceptance CREATE 的 tenor 路由判定

在允许针对母信用证发起 Acceptance CREATE 之前，会先运行 checkAcceptanceTenorConsistency()：若母信用证为 Sight，则无条件阻断；否则，当两者皆已提供时，传入的 requestedTenorType 必须与母信用证自身声明的 tenorType 一致。

```mermaid
flowchart TD
  START(["在母信用证下\n发起 Acceptance CREATE 请求"]) --> Q1{"母信用证 tenorType\n== SIGHT？"}
  Q1 -->|yes| ERR1["REJECT：\nSight 信用证仅通过 UTILIZE（A4）结算，\n绝不通过 Acceptance（A5）"]
  Q1 -->|no| Q2{"母信用证 tenorType 已设置\n且 requested tenorType 已设置？"}
  Q2 -->|no, one or both missing| OK1(["OK——无需比对，\nAcceptance CREATE 继续执行"])
  Q2 -->|yes| Q3{"母信用证 tenorType ==\nrequested tenorType？"}
  Q3 -->|yes| OK2(["OK——tenor 一致，\nAcceptance CREATE 继续执行"])
  Q3 -->|no| ERR2["REJECT：\nAcceptance 的 tenorType 必须\n与母信用证自身声明的 tenorType 一致"]
```

## 证据来源

- `microservices/balance-component/src/domain/tenorRouting.ts (full file)`

## 相关知识

- Balance 推导（Derivation）、状态转换（Status Transition）、Tenor 路由（Tenor Routing）
- [[Business-Rule-Index]]
