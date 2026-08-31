---
knowledge_id: independent-checker-session-release-reject-guard-fix
title: "独立 Checker 会话的 release/reject 守卫修复"
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

# 独立 Checker 会话的 release/reject 守卫修复

release()/reject() 方法开头的守卫逻辑原本要求必须存在“当前会话自己的” makerContext.submitResult；但 isCheckerCompoundOwnSubmission 自身的 settlesDocumentArrival/documentArrivalWithSg/SETTLE 分支，其判断完全基于服务端加载的 selectedCheckerMovement 字段（referencedTransactionId/businessEventId）——与最初是哪个会话执行了 Submit 无关。这导致一个真正独立的 Checker 会话（该会话内没有执行过 Submit，submitResult 为 null）的每一次点击都被静默吞掉，完全没有发出任何网络请求。修复方式是放宽守卫条件为“selectedCheckerMovement 或 submitResult 二者之一存在即可”——这与 buildCheckerActionContext()/CheckerActionsService 在全局已经采用的模式保持一致。

## Source Evidence

- `transaction-builder.component.ts:373-402`
- `transaction-builder.component.ts:470-478`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
