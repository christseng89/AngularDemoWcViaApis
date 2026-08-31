---
knowledge_id: derivelcamount-client-side-face-amount-mirror
title: "deriveLcAmount()——客户端侧的 Face Amount 镜像计算"
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

# deriveLcAmount()——客户端侧的 Face Amount 镜像计算

对微服务自身那个死代码/从未接线的 computeFaceAmount() 的客户端侧重新实现（没有任何 API 字段暴露该值）。仅汇总 RELEASED 状态的根层级事件：对于 IPLC_LC/EPLC_LC，ISSUE(+)/AMEND_INCREASE(+)/AMEND_DECREASE(-)，金额始终为正；对于 EPLC_CONFIRMATION，ISSUE(+) 与 AMEND（已带符号，原样相加，因为 Export Confirmation 没有独立的 Increase/Decrease movementType）。使用普通 JS Number（而非 decimal.js）——这是刻意为之，因为这里仅用于展示，从不参与任何影响余额的计算。

## 证据来源

- `inquire-events.service.ts:144-173`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
