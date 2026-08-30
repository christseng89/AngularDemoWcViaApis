---
knowledge_id: a3s-matched-businesseventid-sg-redemption-netting-ordering
title: "A3S matched-businessEventId SG 赎回净额处理顺序"
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

# A3S matched-businessEventId SG 赎回净额处理顺序

在「含 Shipping Guarantee 的提货文件到单」（Document-Arrival-with-Shipping-Guarantee，A3S）模式下（import-case-4/6/7/8），SG 自身的 PARTIAL_REDEEM/FULL_REDEEM movement 会被优先创建并保持 PENDING 状态，与紧随其后创建的、相匹配的 Document Arrival UTILIZE 共享同一个 businessEventId。在 Document Arrival 自身的充分性检查运行之前，这笔仍处于 PENDING、共享该 businessEventId 的赎回会先被净额扣除出该信用证自身的表外风险敞口——这使得同样金额但未匹配、且不带 businessEventId 的普通 Document Arrival，在 v0.12 之后的规则下本应被硬性拒绝（409）的提示单，得以顺利通过。import-case-4 自身的行内注释记载，此用例是对一个曾经（错误地）演示"非阻断性 WARNING"的场景的重写，而 v0.12 的硬性拒绝重设计已使该行为在架构上不再可能出现。

## 证据来源

- `backend/data/businessCases.js:326-446`
- `backend/data/businessCases.js:555-618 (import-case-6, two A3S pairs)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
