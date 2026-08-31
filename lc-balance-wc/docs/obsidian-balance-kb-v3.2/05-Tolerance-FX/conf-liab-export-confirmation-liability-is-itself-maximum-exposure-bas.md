---
knowledge_id: conf-liab-export-confirmation-liability-is-itself-maximum-exposure-bas
title: "CONF LIAB（出口保兑负债）本身即为最大风险敞口基准"
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

# CONF LIAB（出口保兑负债）本身即为最大风险敞口基准

对于出口信用证保兑（EPLC_CONFIRMATION）而言，真正承载容差缓冲的是保兑行自身的负债（CONF LIAB）——而不是仅作参考用途的底层 EPLC_LC 的余额。源码注释中业务已确认的示例为："Confirm LC 100,000 w Tolerance 10% -> CONF LIAB 110,000."（保兑信用证 100,000，容差 10%，则保兑负债为 110,000）。这正是 EPLC_CONFIRMATION 虽然与 IPLC_LC/EPLC_LC 属于不同金融工具类型、却仍适用容差规则的原因。

## 来源证据

- `src/domain/tolerance.ts:12-17`
- `test/unit/domain/tolerance.test.ts:17-20`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
