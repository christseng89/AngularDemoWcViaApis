---
knowledge_id: channel-compound-leg-functions-a3s-b4-b5
title: "Channel 复合分腿功能：A3S、B4、B5"
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

# Channel 复合分腿功能：A3S、B4、B5

A3S（单据到达搭配 Shipping Gtee，Document Arrival w/ Shipping Gtee）由 2 条 leg 组成：先赎回匹配的 SHGT，再执行 LC 自身的 UTILIZE，两者金额相同。B4（Honour/Acceptance）在 Sight 情形下为 2 条 leg（HONOUR + EPLC_DUE_FROM_ISSUING_BANK CREATE），在 Usance 情形下为 4 条 leg（ACCEPT + EPLC_ACCEPTANCE CREATE + EPLC_ACCEPTANCE_REIMB_RECEIVABLE CREATE），具体由该 Confirmation 自身声明的 Tenor Type 决定。B5（Settlement）由 2 条 leg 组成：EPLC_ACCEPTANCE FULL_SETTLE 及与之配对的 EPLC_ACCEPTANCE_REIMB_RECEIVABLE REIMBURSE，金额相同，且由同一个 Checker 放行动作完成。每条 leg 都是各自独立的一次 POST /channel/transactions 调用（以及各自独立的一次 .../release 调用），彼此共享同一个 businessEventId。

## Source Evidence

- `balance-component-channel-api.yaml lines 645-659 (compoundLegs schema doc)`
- `balance-component-channel-api.yaml lines 865-876, 956-981 (A3S/B4/B5 examples)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
