---
knowledge_id: sg-bills-amounts-are-always-face-value-never-tolerance-adjusted
title: "SG/Bills 金额始终为面值，绝不做容差调整"
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

# SG/Bills 金额始终为面值，绝不做容差调整

业务规则于 2026-08-14 确认（源码注释中逐字引用，中文原文）："Tolerance只有開證與修證適用...SG或IB就是SG AMOUNT或BILLS AMOUNT"——容差仅适用于信用证的开立与修改；Shipping Guarantee（SG）或进口汇票（Import Bill）的金额始终就是其自身声明的面值，不存在缓冲概念。这正是将 SHGT/IPLC_ACCEPTANCE/EPLC_ACCEPTANCE 排除在 TOLERANCE_APPLICABLE_INSTRUMENT_TYPES 之外的业务依据。

## 来源证据

- `src/domain/tolerance.ts:19-21`
- `test/unit/domain/tolerance.test.ts:44-47`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
