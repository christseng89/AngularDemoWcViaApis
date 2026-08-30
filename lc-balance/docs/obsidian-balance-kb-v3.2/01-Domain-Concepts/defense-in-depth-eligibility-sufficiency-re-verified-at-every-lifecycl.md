---
knowledge_id: defense-in-depth-eligibility-sufficiency-re-verified-at-every-lifecycl
title: "Defense-in-depth: eligibility/sufficiency re-verified at every lifecycle stage"
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

# Defense-in-depth: eligibility/sufficiency re-verified at every lifecycle stage

这是本组件中一种反复出现的架构模式：并非只检查一次适格性/充足性，而是在每一个状态有可能已经发生漂移的阶段都重新评估同一条规则——Close 自身的适格性+金额检查会在选择器提示阶段、Maker 提交阶段、以及 Checker 放行阶段各执行一次，原因正是提交与放行之间的时间窗口，足以让一笔无关的交易改变底层余额。

## Source Evidence

- `microservices/balance-component/src/service/balanceService.ts lines 413-430`
- `microservices/balance-component/test/unit/service/closeFunction.test.ts lines 187-222`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
