---
knowledge_id: compound-business-events-span-multiple-balancemovement-legs-under-one-
title: "组合业务事件在同一个 businessEventId 下横跨多个 BalanceMovement leg"
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

# 组合业务事件在同一个 businessEventId 下横跨多个 BalanceMovement leg

多项贸易金融动作并非单笔独立的分类账过账，而是一束必须一起联动的相关联 leg：A3S 将一笔 SG 赎回与一次 Document Arrival 打包；B4 Sight 将一次 Confirmation Honour 与一笔新的 Due-from-Issuing-Bank 资产打包（该资产本身又是一笔已释放的 B3 Present Docs 提示的下游）；B4 Usance 将一次 Confirmation Accept 与一笔新的 Acceptance 负债及其 Reimbursement Receivable 资产打包；B5 Usance/CNF_MATURE 将一次 Acceptance settle 与其相匹配的 Reimbursement Receivable 打包。businessEventId（同一事件下的各 leg）与 referencedTransactionId（本记录自身的前驱）是 Checker 层用于跨会话重建并释放/取消这些"意图上原子化"捆绑包所依赖的两种关联机制。

## Source Evidence

- `CLAUDE.md: A3S/B5 checker compound release cross-session fix decision-log entry`
- `checker-actions.service.ts:49-128,233-296`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
