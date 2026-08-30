---
knowledge_id: checkerid-derivation-from-createdby-2-checker-simplification
title: "从 createdBy 推导 checkerId（双 Checker 简化模型）"
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

# 从 createdBy 推导 checkerId（双 Checker 简化模型）

release() 推导实际操作的 Checker 身份时：若该 movement 的 createdBy 为 'maker1'，则记为 'checker1'，否则记为 'checker2'——这是一个简化的双角色 Maker/Checker 职责分离模型（没有真实的身份验证系统，与 CLAUDE.md 中已披露、暂缓处理的 BAL-001/BAL-002 无认证决策一致）。

## Source Evidence

- `checker-actions.service.ts:50`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
