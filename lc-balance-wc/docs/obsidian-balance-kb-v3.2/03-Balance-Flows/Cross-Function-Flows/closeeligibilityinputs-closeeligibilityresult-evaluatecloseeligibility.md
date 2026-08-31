---
knowledge_id: closeeligibilityinputs-closeeligibilityresult-evaluatecloseeligibility
title: "CloseEligibilityInputs / CloseEligibilityResult / evaluateCloseEligibility()"
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

# CloseEligibilityInputs / CloseEligibilityResult / evaluateCloseEligibility()

closeEligibility.ts 中用于 A10/B6 Close 的纯资格判定函数。输入：alreadyClosed、rootConfirmedBalance（仅作信息展示，从不作为判定闸门）、sgConfirmedBalance、acceptanceConfirmedBalance、hasOpenEvents。输出：{eligible, reasons[]}，其中 reasons 会累积每一个未通过的条件，而不仅仅是第一个。

## 证据来源

- `microservices/balance-component/src/domain/closeEligibility.ts lines 21-64`
- `microservices/balance-component/test/unit/domain/closeEligibility.test.ts lines 14-59`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
