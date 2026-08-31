---
knowledge_id: tenor-type-days-carry-and-lock-a1-sight-normalization
title: "Tenor Type/Days 的继承与锁定 + A1 的 Sight 归一化"
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

# Tenor Type/Days 的继承与锁定 + A1 的 Sight 归一化

对于声明了 tenorTypeOptions 的"创建型 + 有父级"功能（A6/B4 这一类），Tenor Type/Days 会从所选中的父级合约继承而来，并在 selectedParent 真正被解析出来之后即锁定（而不是仅仅因为 tenorTypeOptions 非空就锁定）。特别是对于 A1，提交时有一道兜底逻辑：当选择 Sight 时强制将 Tenor Days 置为 0（作为 patch 应用，始终通过），当选择 Usance 时则要求 Tenor Days > 0（否则失败）——这与 buildFields() 自身的实时 Formly 表达式保持一致。

## Source Evidence

- `src/app/transaction-builder/builder-fields.ts lines 56, 121-151`
- `src/app/transaction-builder/submit-rules.spec.ts lines 189-234`
- `src/app/transaction-builder/submit-rules.ts lines 98-106`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
