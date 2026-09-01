---
knowledge_id: compoundlegstate-compoundlegs
title: 'CompoundLegState（compoundLegs）'
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: 'N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]'
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# CompoundLegState（compoundLegs）

`CompoundLegState` 保存 A3S 与 B4 所需的 sibling movement ids／objects，例如 SG redemption、Due-from-Issuing-Bank、Acceptance 与 Acceptance Reimbursement Receivable。A6 的 source 由 referenced transaction 解析。B5 已不使用 matched Receivable state；其提交、Release、Reject 与 Delete Pending 都只处理单一 settlement movement。

## Source Evidence

- `maker-panel.component.ts:1192-1194 (partial reset in submit())`
- `maker-panel.component.ts:456 (full reset in resetForFunction())`
- `maker-panel.component.ts:64-89 (CompoundLegState interface + EMPTY_COMPOUND_LEGS)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
