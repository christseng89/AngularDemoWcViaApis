---
knowledge_id: eligibility-rule-unification-eligibility-rule-ts
title: "资格规则统一化（eligibility-rule.ts）"
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

# 资格规则统一化（eligibility-rule.ts）

applyEligibilityRule() 将三个各自独立手写的选择器（picker）getter 中重复出现的尾部逻辑，统一收敛为一个 EligibilityRule 可辨识联合类型（discriminated union）：'hintSet'（是否属于预先算好的合格 ID 集合/映射）、'unconditional'（直接放行）、'genericFallback'（排除 Available Balance 为 0 的候选项，可再依 movementType 进行门控）。该函数本身并不决定"哪个选择器该套用哪条规则"——这部分仍由各调用点自行依据 TransactionFunction 注册表中、未纳入本次 Strategy 迁移范围的字段来解析。

## Source Evidence

- `src/app/transaction-builder/eligibility-rule.ts lines 1-61`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
