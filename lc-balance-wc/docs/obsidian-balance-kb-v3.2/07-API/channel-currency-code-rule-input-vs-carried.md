---
knowledge_id: channel-currency-code-rule-input-vs-carried
title: "Channel 币别代码规则（INPUT 与 CARRIED 的区别）"
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

# Channel 币别代码规则（INPUT 与 CARRIED 的区别）

仅对 A1（LC Issue）与 B1（Confirm LC）而言，Currency Code 是调用方可自由输入的内容，并会成为新记录永久性的 Currency Code（ChannelOriginTransactionRequest，currency 为必填）。对其余所有功能，Currency Code 都是被继承并受保护的——这不仅体现为忽略多余输入，更在 schema 层面被强制：ChannelDerivedTransactionRequest 根本没有 `currency` 属性，且 additionalProperties:false，因此一旦提交该字段就会触发 400 的 schema 校验失败。

## Source Evidence

- `balance-component-channel-api.yaml lines 53-66 (top-level CURRENCY CODE section)`
- `balance-component-channel-api.yaml lines 733-802 (ChannelOriginTransactionRequest / ChannelDerivedTransactionRequest schemas)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
