---
knowledge_id: checkamenddecreasesufficiency
title: "checkAmendDecreaseSufficiency()"
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

# checkAmendDecreaseSufficiency()

纯函数，接收 {amount, ceilingAmount, tightAvailableBalance}，当 ceilingAmount > tightAvailableBalance 时予以拒绝。错误信息刻意将原始面值金额（raw face-level amount）与经 Tolerance 换算后的 ceilingAmount 并排显示——这是在某次评审者混淆了这两个数字之后才加入的。

## 证据来源

- `microservices/balance-component/src/domain/amendDecrease.ts lines 39-62`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
