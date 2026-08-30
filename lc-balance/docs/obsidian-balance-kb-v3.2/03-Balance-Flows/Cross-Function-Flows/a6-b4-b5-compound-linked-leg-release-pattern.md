---
knowledge_id: a6-b4-b5-compound-linked-leg-release-pattern
title: "A6 / B4 / B5 复合式关联腿（linked-leg）release 模式"
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

# A6 / B4 / B5 复合式关联腿（linked-leg）release 模式

三种不同的复合结构都遵循相同的骨架：先创建主/关联腿（primary/linked legs，共享 businessEventId，和/或主腿携带指向其自身来源 movement 的 referencedTransactionIdRef），然后按固定顺序 release。A6（Acceptance CREATE 引用一笔 Document Arrival）：先 release Document Arrival（通过其自身解析出的 referencedTransactionId），再 release Acceptance CREATE。B4（Honour/Accept 引用一笔 B3 Present-Docs earmark，并附带一条关联的资产/负债腿——Sight/HONOUR 对应 EPLC_DUE_FROM_ISSUING_BANK，Usance/ACCEPT 对应 EPLC_ACCEPTANCE + EPLC_ACCEPTANCE_REIMB_RECEIVABLE）：先 release B4 的主腿（其副作用是同时将所引用的 B3 记录标记为"consumed"），再 release 关联腿。B5（Acceptance FULL_SETTLE + Reimbursement Receivable REIMBURSE）：先 release 主结算，再 release 关联的偿付（reimbursement）。

## 证据来源

- `backend/data/businessCases.js:1813-1855,1902-1997 (B4/B5)`
- `backend/data/businessCases.js:743-794 (A6)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
