---
knowledge_id: naturalkeyalreadyexistserror-re-issue-guard-against-an-already-active-
title: "NaturalKeyAlreadyExistsError——防止对已处于 ACTIVE 状态的自然键重复 ISSUE 的守卫"
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

# NaturalKeyAlreadyExistsError——防止对已处于 ACTIVE 状态的自然键重复 ISSUE 的守卫

如果一笔具有建立性质的 movementType（ISSUE/CREATE）所提交的自然键，已经解析对应到一个处于 ACTIVE 状态的逻辑合约，就必须以 409 NATURAL_KEY_ALREADY_EXISTS 拒绝，而不能被悄悄当成叠加在既有已确认余额（Confirmed Balance）之上的普通移动来处理。这一改动堵上了一个业务方反馈的漏洞：过去对同一 LC Number 重新 Issue，会被悄悄新增第二笔 ISSUE 移动，而不是被拒绝；AMEND_INCREASE/AMEND_DECREASE/AMEND 才是变更既有合约金额的正确途径。

## 来源证据

- `microservices/balance-component/src/errors.ts:48-61`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
