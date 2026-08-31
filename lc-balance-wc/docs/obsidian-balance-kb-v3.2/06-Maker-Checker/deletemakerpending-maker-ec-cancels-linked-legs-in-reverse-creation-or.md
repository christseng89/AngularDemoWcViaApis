---
knowledge_id: deletemakerpending-maker-ec-cancels-linked-legs-in-reverse-creation-or
title: "deleteMakerPending()（Maker EC）按创建顺序的逆序取消关联 leg"
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

# deleteMakerPending()（Maker EC）按创建顺序的逆序取消关联 leg

Maker 自己撤回一笔刚提交、仍处于 PENDING 状态的项目（/cancel，不同于 Checker 的 /reject）时，会以创建顺序的**逆序**取消组合 leg，再取消主记录，从而确保一次 EC 不会遗留下一个后创建的 leg 成为孤儿：A3S/A3+SG 会先取消 SG 赎回；B3（createsIssuingBankReceivableOnHonour）会先取消 Due from Issuing Bank 资产；B4 Usance/ACCEPT 依次取消 Reimbursement Receivable、Acceptance 负债，最后取消主记录；B5 Usance/CNF_MATURE 会先取消相匹配的 Reimbursement Receivable。在发起任何 API 调用之前，要求 ctx.createdBy 非空（运行时守卫，BAL-132）。

## Source Evidence

- `checker-actions.service.spec.ts:439-464`
- `checker-actions.service.ts:161-223`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
