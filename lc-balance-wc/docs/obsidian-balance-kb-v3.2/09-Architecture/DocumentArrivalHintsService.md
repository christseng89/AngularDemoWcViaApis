---
knowledge_id: documentarrivalhintsservice
title: "DocumentArrivalHintsService"
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

# DocumentArrivalHintsService

拥有 A1-A9/B1-B5 每一项功能自身按候选项计算的 LC Index 资格提示数据：A4 自身合约的应付 IB 提示、A6 母 LC 的应付 IB 提示、B4 跨合约的子应付提示、A3S/A9 的 SG 余额资格集合，以及 A10/B6 的可结案（Close-eligible）集合（这是唯一一个例外，通过单次聚合服务端调用取得，而非逐候选项获取）。不拥有选择器自身的分页逻辑，也不拥有消费这些映射表的业务规则过滤逻辑——这两者仍留在 TransactionBuilderComponent 中。

## 证据来源

- `document-arrival-hints.service.ts:1-193`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
