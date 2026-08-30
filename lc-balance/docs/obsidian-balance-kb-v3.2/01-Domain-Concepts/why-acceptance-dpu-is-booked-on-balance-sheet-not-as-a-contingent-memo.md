---
knowledge_id: why-acceptance-dpu-is-booked-on-balance-sheet-not-as-a-contingent-memo
title: "为何承兑/延期付款负债（Acceptance/DPU）应表内入账，而非作为或有负债备忘对分录"
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

# 为何承兑/延期付款负债（Acceptance/DPU）应表内入账，而非作为或有负债备忘对分录

一旦银行对相符交单承兑汇票或承担延期付款义务（DPU），即持有一项现时的、无条件的、需在可确定日期支付可确定金额的义务——依 IAS 32.11 / IFRS 9 3.1.1 属于金融负债，并对应一项对申请人的无条件偿付追索权。这既非或有负债，也非贷款承诺，因此采用 IFRS 报告准则的银行须自承兑发生之时起，在资产负债表两侧均以总额（GROSS）列示承兑；若仍将承兑账簿留在表外，会使总资产与总负债按整个组合规模被低估。旧式备忘对分录（Customers' Liability / DC Outstanding 式的借/贷）仅作为供 MIS/MT 对账使用的报告影子（SHADOW）保留，而不再作为会计记录本身。当信用证或有负债转化为承兑时，对申请人的总信用风险暴露并未改变——义务只是变了形式，规模未变——但资本处理却发生显著变化（CCF 从贸易类 20% 变为已提用债权类 100%，RWA 随之上升）。

## 来源证据

- `TF_Balance_Component_Spec-en.txt §2.3 (E9), §2.6 balance type catalogue: ACCEPTANCE_DPU_OUTSTANDING is ON_BALANCE_LIABILITY, ACCEPTANCE_SHADOW_DR/_CR is MEMO_ONLY`
- `TF_Contingent_Liability_Lifecycle-en.txt §3.7: 'On-balance sheet, not contingent. An acceptance is not a memo pair under IFRS...'`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
</content>
