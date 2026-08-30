---
knowledge_id: error-channelerror-code-taxonomy
title: "Error / ChannelError 错误码分类体系"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-30
tags:
  - balance
  - domain-concept
---

# Error / ChannelError 错误码分类体系

微服务的 Error.code 包括：REQUEST_VALIDATION_FAILED（400）、INSUFFICIENT_AVAILABLE_BALANCE（409）、NATURAL_KEY_ALREADY_EXISTS（409）、CURRENCY_MISMATCH（409）、ILLEGAL_STATE_TRANSITION（409）、NOT_FOUND（404）、INTERNAL_ERROR（500，恒为固定通用信息，真实详情仅记录在服务端日志）。ChannelError 原样透传相同分类。`partialSuccess` 只保留为旧版 Channel 相容欄位；现行多腿 command 使用 atomic compound API，不应产生部分成功结果。

## Source Evidence

- `balance-component-api.yaml lines 1735-1751 (Error schema)`
- `balance-component-channel-api.yaml lines 804-830 (ChannelError schema)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
