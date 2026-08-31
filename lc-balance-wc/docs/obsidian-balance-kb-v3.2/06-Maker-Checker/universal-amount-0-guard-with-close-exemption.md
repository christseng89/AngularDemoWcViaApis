---
knowledge_id: universal-amount-0-guard-with-close-exemption
title: "通用 Amount > 0 守卫（CLOSE 例外豁免）"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 本次分析快照中无 .git 历史记录，详见 [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# 通用 Amount > 0 守卫（CLOSE 例外豁免）

业务需求"A1-A9、B1-B5 的 Amount 数值应大于 0"，在 validateSubmit() 中以一个守卫的形式统一强制执行，在几乎所有其他守卫之前就完成检查，适用于包括 A1/B1 在内的所有功能。A10/B6（CLOSE）是唯一、刻意设置的例外——对于一张已经完全用尽的 LC 而言，0 是合法的核销（write-off）数值；即便输入了负数，这个纯函数本身也不会拦截（是否精确等于 Confirmed Balance 的检查，放在服务端进行）。

## Source Evidence

- `src/app/transaction-builder/submit-rules.spec.ts lines 556-606`
- `src/app/transaction-builder/submit-rules.ts lines 67-77`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
