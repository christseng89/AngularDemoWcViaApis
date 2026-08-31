---
knowledge_id: b3-b4-compound-release-export-present-docs-honour-accept
title: "B3 -> B4 复合式 release（Export Present Docs -> Honour/Accept）"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# B3 -> B4 复合式 release（Export Present Docs -> Honour/Accept）

Export Case #6/#7/#8/#9 所采用的当前（2026-08-18 之后）架构：B3 会先真正独立完成自身的 release，然后 B4 才会接手；B4 自身的 release 会将该 B3 记录标记为 consumed，作为其副作用。

```mermaid
flowchart TD
  A["B3：创建 EPLC_EXAMINATION CREATE（Present Docs 备忘性 earmark）"] --> B["Checker release B3——真正的 RELEASE，此时状态为 EARMARKED"]
  B --> C["B4：在 EPLC_CONFIRMATION 上创建 HONOUR/ACCEPT，referencedTransactionIdRef -> B3 自身的 movementId，共享同一个 businessEventId"]
  C --> D["创建共享同一 businessEventId 的关联腿：DUE_FROM_ISSUING_BANK（Sight/HONOUR）或 ACCEPTANCE + REIMB_RECEIVABLE（Usance/ACCEPT）"]
  D --> E["Checker release B4 的主腿——同时通过 referencedTransactionId 将 B3 记录标记为 consumed"]
  E --> F["Checker release 关联腿"]
```

## 证据来源

- `backend/data/businessCases.js:1792-1855,1882-1997`

## 相关知识

- Business Case Registry（后端编排器）+ Business Case Runner UI
- [[Business-Rule-Index]]
