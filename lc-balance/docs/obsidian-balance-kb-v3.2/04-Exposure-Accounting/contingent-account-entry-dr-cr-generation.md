---
knowledge_id: contingent-account-entry-dr-cr-generation
title: "或有负债科目分录（Dr/Cr）生成"
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

# 或有负债科目分录（Dr/Cr）生成

每一笔在范畴内的或有负债异动，都会精确生成一组 Dr/Cr 科目分录，在异动建立当下即一次性推导完成，并以不可变方式持久化存储——之后绝不重新计算。每一种 instrumentType 都对应五个具名会计"科目族"（analysis/contingent-liability-ledger.html 的 Folio 1–5）之一：LC（Folio 1）、SHGT（Folio 2）、进口承兑/DPU 影子备忘（Folio 3）、出口保兑（Folio 4）、出口承兑/DPU 影子备忘（Folio 5）。每个科目究竟担任 Dr 还是 Cr 一方，取决于该异动是在"建立"风险敞口（方向系数 +1，例如 ISSUE），还是在"解除"风险敞口（方向系数 −1，例如 UTILIZE/REDEEM/SETTLE）——这里复用的是 balanceDerivation.ts 自身的 MOVEMENT_DIRECTION 对照表，而不是另建一份独立的方向映射表。

## 来源证据

- `microservices/balance-component/src/domain/contingentAccountEntry.ts:1-151`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
