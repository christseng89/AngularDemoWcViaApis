---
knowledge_id: confirmed-available-tight-available-face-amount-balance-figures
title: "Confirmed / Available / Tight Available / Face Amount balance figures"
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

# Confirmed / Available / Tight Available / Face Amount balance figures

针对一份 LC/Confirmation/SHGT/Acceptance 合约，共有四个各自独立、在查询时刻计算的余额数字，全部由异动清单推导而来、不做存储：Confirmed Balance（法律上已核准的部分）、Available Balance（Confirmed 再依双向仍处 PENDING 状态的异动调整而得）、Tight Available Balance（更严格的数字，仅计入已放行的增加，但仍立即扣减处于 PENDING 状态的减少——其完整公式在其他地方还会扣除表外风险暴露，不在这三个文件范围内），以及 Face Amount（信用证的名义金额，不受动支/UTILIZE 影响）。

## Source Evidence

- `CLAUDE.md decision-log entries 'Balance derivation' and 'Tight Available Balance now derives from Confirmed Balance, not Available Balance'`
- `microservices/balance-component/src/domain/balanceDerivation.ts`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
