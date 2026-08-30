---
knowledge_id: asymmetric-netting-sg-issue-occupies-capacity-from-submit-sg-redemptio
title: "非对称净额：SG Issue 自 Submit 起即占用额度，SG Redemption 需待 Released 才释放额度"
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

# 非对称净额：SG Issue 自 Submit 起即占用额度，SG Redemption 需待 Released 才释放额度

SHGT ISSUE 异动一旦进入 PENDING（Maker 已 Submit）状态，就会立即计入尚未清偿的表外风险敞口——"占用從寬"（宽松／立即占用）。而 PARTIAL_REDEEM/FULL_REDEEM 异动（用来释放 SG 已预留的额度）则只有在真正被 Checker RELEASED 之后才会计入——"增加從嚴"（严格／唯有获准后才计入）。这种不对称设计保护了信用证的真实额度：假如某笔独立赎回的 PENDING 核准之后被驳回，而另一笔不相关的第二笔交易先前已经依赖那笔被释放的额度，就有可能让银行超过其真实上限。

## 来源证据

- `microservices/balance-component/src/domain/offBalanceExposure.ts:14-52 (doc comment), :58-64 (filter logic)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
