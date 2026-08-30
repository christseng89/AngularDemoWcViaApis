---
knowledge_id: a10-b6-close-write-off-lifecycle
title: "A10 / B6 Close 核销生命周期"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# A10 / B6 Close 核销生命周期

每个以 Close 终结的用例都遵循的模式，以及资格不通过的反例用例（import-case-11/12、export-case-11）如何证明该操作在原子性上是全有或全无（all-or-nothing）。

```mermaid
flowchart TD
  A["每一条子级账目（SG / Acceptance / 已消费的 Present-Docs 提示单）都被推进到各自的终态"] --> B["快照：读取母合约当前剩余的 Confirmed Balance"]
  B --> C["Maker 创建 CLOSE movement，金额精确等于该 Confirmed Balance"]
  C --> D{"资格判定：所有 SG/Acceptance 子级均为 0，且整棵树中没有任何未结 Event？"}
  D -->|no| E["409 资格 ERROR——合约、状态与余额均完全保持不变"]
  D -->|yes| F["Checker release CLOSE"]
  F --> G["合约状态 -> CLOSED，Confirmed Balance -> 0"]
```

## 证据来源

- `backend/data/businessCases.js:839-1027,1029-1135,1137-1362,2007-2102,2317-2412`

## 相关知识

- Business Case Registry（后端编排器）+ Business Case Runner UI
- [[Business-Rule-Index]]
