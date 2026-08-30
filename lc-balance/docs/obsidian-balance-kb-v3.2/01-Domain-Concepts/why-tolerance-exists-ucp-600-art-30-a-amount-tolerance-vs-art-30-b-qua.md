---
knowledge_id: why-tolerance-exists-ucp-600-art-30-a-amount-tolerance-vs-art-30-b-qua
title: "为何存在容差（Tolerance）——UCP 600 Art. 30(a) 金额容差 与 Art. 30(b) 数量容差之别"
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

# 为何存在容差（Tolerance）——UCP 600 Art. 30(a) 金额容差 与 Art. 30(b) 数量容差之别

容差/上限（ceiling）换算之所以存在，是因为 UCP 600 Art. 30(a) 允许以"about"/"approximately（大约）"表述的信用证金额被解读为 ±10%，这确实提高了银行的最高合同责任——一笔"约 USD 100,000"的信用证实际上是一笔真实的 110,000 承诺，其或有负债、ECL、经 CCF 加权的 EAD 以及客户限额预留，都必须以该 max_liability（最高责任额）为准，而非票面金额。Art. 30(b) 单独规定的 ±5% 数量容差则不会提高责任额：该条款明确以"总提用金额不超过信用证金额"为前提条件，因此纯粹是一项单据审核层面的属性。若将容差类型记错（例如把 30(b) 的数量容差当作会提高上限的容差处理），会导致或有负债、ECL、经 CCF 加权的 EAD 以及客户限额预留均被多计。这正是实际 Balance Component 中 tolerancePct/ceilingAmount 字段（仅适用于 IPLC_LC/EPLC_LC/EPLC_CONFIRMATION）的领域理论依据。

## 来源证据

- `TF_Balance_Component_Spec-en.txt §1.2 register: amount_tolerance_pct (30(a) only), quantity_tolerance_pct, max_liability`
- `TF_Contingent_Liability_Lifecycle-en.txt §3.1: '"About"/"approximately"...means ±10%...Art. 30(b)'s ±5% quantity tolerance does not raise it'`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
</content>
