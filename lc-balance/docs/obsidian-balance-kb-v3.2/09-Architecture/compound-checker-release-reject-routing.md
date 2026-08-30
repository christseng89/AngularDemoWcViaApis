---
knowledge_id: compound-checker-release-reject-routing
title: "复合式 Checker 放行/拒绝路由"
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

# 复合式 Checker 放行/拒绝路由

TransactionBuilderComponent.isCheckerCompoundOwnSubmission 用于判断当前选中的 Checker 队列 movement 是否属于一笔多腿复合提交的一部分（A3S 的 SG 赎回配对、B5 的结算配对、A6/B4 的 settlesDocumentArrival 配对，或 B4 的 confirmationHonourWithReceivable），从而必须走完整的 release()/reject() 复合流程，而不是简单的单腿 API 调用。该判断读取 FunctionStrategy 标志位，以及该 movement 自身的 businessEventId/referencedTransactionId，且刻意地对四种形态中的三种不以当前会话自身的 submitResult 作为门控条件（这是在一个实际生产环境报告的缺陷——某个独立 Checker 会话点击后被静默地空操作——被修复之后才有的处理方式）。

## 证据来源

- `transaction-builder.component.ts:272-292`
- `transaction-builder.component.ts:373-402`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
