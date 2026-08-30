---
knowledge_id: divergences-from-the-source-specification-are-deliberately-documented-
title: "与原始规格的差异是刻意记录、而非隐藏"
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

# 与原始规格的差异是刻意记录、而非隐藏

该文档的实现说明附录，其存在的目的正是记录原始设计规格（TF_Balance_Component_Spec、TF_Contingent_Liability_Lifecycle）与 Balance Component 实际已上线行为之间的已知差距——例如 SG 部分赎回、买方远期承兑（Buyer's Usance Acceptance）的处理方式、出口 Tenor 合并、缺失的 Amendment-Decrease 同意门控、缺失的到期/注销功能等。每一项差异都被明确标注为经业务核准的既定差异，或是当前尚未实现的必要事件，而不是被悄悄调和或略而不提。

## 来源证据

- `analysis/contingent-liability-ledger.html #notes section, items 1,4,7,8,9,10`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
