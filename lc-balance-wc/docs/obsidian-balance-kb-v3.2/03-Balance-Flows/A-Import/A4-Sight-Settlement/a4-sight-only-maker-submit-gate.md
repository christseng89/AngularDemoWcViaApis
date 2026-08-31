---
knowledge_id: a4-sight-only-maker-submit-gate
title: "A4 仅限 Sight 的 Maker Submit 关卡"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# A4 仅限 Sight 的 Maker Submit 关卡

按 tenor 分支的判断逻辑，存在于每个 Import 用例的 Document Arrival 流程之中，纯粹体现在 registry 自身的 step 形态里。

```mermaid
flowchart TD
  A["Maker 针对 IPLC_LC 创建 Document Arrival（UTILIZE）"] --> B{"母信用证的 tenorType？"}
  B -->|SIGHT| C["makerSubmit step：POST .../maker-submit"]
  C --> D["Checker release：POST .../release（由 A4 完成落地）"]
  B -->|BUYERS_USANCE / SELLERS_USANCE| E["直接 Checker release——不设 makerSubmit step"]
  E --> F["稍后通过 A6 自身与 Acceptance 关联的复合式 release 完成落地"]
```

## 证据来源

- `backend/data/businessCases.js:123-134,297-302,1190-1191`
- `backend/data/businessCases.js:177-227 (Usance UTILIZE, no makerSubmit)`

## 相关知识

- Business Case Registry（后端编排器）+ Business Case Runner UI
- [[Business-Rule-Index]]
