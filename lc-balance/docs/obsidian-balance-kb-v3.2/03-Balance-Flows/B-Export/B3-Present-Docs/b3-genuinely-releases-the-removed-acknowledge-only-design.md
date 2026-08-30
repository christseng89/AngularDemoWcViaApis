---
knowledge_id: b3-genuinely-releases-the-removed-acknowledge-only-design
title: "B3 真正执行 RELEASE；被移除的仅 acknowledge() 设计"
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

# B3 真正执行 RELEASE；被移除的仅 acknowledge() 设计

在 2026-08-18 之前，B3（Present Docs / EPLC_EXAMINATION）使用的是一个一次性的 'acknowledge' step/endpoint，从未真正转换状态。经重新设计后，B3 现在会在 B4 接手之前，使用标准的 release step（真正的 PENDING->RELEASED 转换，EARMARKED）——B4 自身的复合式 release 不再对已处于 RELEASED 状态的 B3 记录重复执行 release（否则会 409）；而是通过 referencedTransactionId，将其标记为 'consumed'，作为 release Honour/Accept 的副作用。测试套件中已有明确断言予以实测确认：从不会产生任何类型为 'acknowledge' 的 trace 记录，且 B3 自身的 release step 在 trace 顺序上先于 B4 自身的 createMovement step。

## 证据来源

- `backend/data/businessCases.js:23-32,1792-1812,1882-1900`
- `backend/test/server.test.js:208-234`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
