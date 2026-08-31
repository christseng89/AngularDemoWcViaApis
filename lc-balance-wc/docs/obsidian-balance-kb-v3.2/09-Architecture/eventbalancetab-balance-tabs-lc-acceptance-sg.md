---
knowledge_id: eventbalancetab-balance-tabs-lc-acceptance-sg
title: "EventBalanceTab / Balance Tab（LC/Acceptance/SG）"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# EventBalanceTab / Balance Tab（LC/Acceptance/SG）

针对每个选中的 Event，最多展示 3 个标签页：LC/Confirmed-LC（始终存在）、Acceptance（仅限 Usance 期限类型）、SG（仅限 Import IPLC_LC，任意期限）。每个标签页携带 {key,label,title,snapshot,impact}。'impact'（before/after）只会附加在该事件自身账本所属的标签页上——同级/根级标签页展示的是已持久化的同级/根级快照，且 impact:null。内容直接读取自 movement 上已持久化的字段（除作为旧版兜底逻辑外，从不实时获取），由微服务的 assembleSnapshot()/captureSiblingSnapshots() 在 Create/Release 时填充。

## 证据来源

- `inquire-events.service.ts:175-211 EventBalanceTab + class doc comment`
- `inquire-events.service.ts:519-549 tab construction in selectEvent()`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
