---
knowledge_id: re-issue-guard-on-natural-key
title: "针对自然键的重复 Re-ISSUE 防护"
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

# 针对自然键的重复 Re-ISSUE 防护

一个创建类 movementType（IPLC_LC/EPLC_LC/EPLC_CONFIRMATION 上的 ISSUE，IPLC_ACCEPTANCE/EPLC_ACCEPTANCE 上的 CREATE）如果提交给一个已经解析到某个 ACTIVE Logical Contract 的自然键，会被以 409 NATURAL_KEY_ALREADY_EXISTS 拒绝，而不是悄悄地在既有 Confirmed Balance 之上再叠加一次 ISSUE。针对 EPLC_CONFIRMATION 的错误信息会明确指出正确的替代方案是 AMEND_INCREASE/AMEND_DECREASE/AMEND；而针对 IPLC_LC/IPLC_ACCEPTANCE 的错误信息则省略了「/AMEND」这一支路，因为这两类工具永远只使用 AMEND_INCREASE/AMEND_DECREASE。该防护的作用范围是按自然键各自独立的，而非全局性的——不同的 LC Number 不受影响。

## Source Evidence

- `src/errors.ts:58-61`
- `test/unit/app.test.ts:2186-2212`
- `test/unit/app.test.ts:955-1062`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
