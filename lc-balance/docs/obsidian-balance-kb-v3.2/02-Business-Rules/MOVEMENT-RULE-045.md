---
knowledge_id: MOVEMENT-RULE-045
title: "到期解除的触发时点为 expiry_date + mail_float_grace — 永远不与 UCP 600 第 14(c) 条的 21 天叠加（设计文档规则，未在实际运行代码中实现）"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - movement
  - confirmed
---

# MOVEMENT-RULE-045 — 到期解除的触发时点为 expiry_date + mail_float_grace — 永远不与 UCP 600 第 14(c) 条的 21 天叠加（设计文档规则，未在实际运行代码中实现）

## Status
CONFIRMED

## Business Rule
按照源设计文档：LC/Confirmation 项下未使用的剩余或有负债，必须在 expiry_date + mail_float_grace（加上任何第 29 条项下的展期）时予以解除，而绝不能在到期日当天解除；并且 UCP 600 第 14(c) 条规定的 21 个公历日提示期，绝不能在到期日的基础上再额外叠加。这仅描述设计文档的意图——在实际运行的微服务代码中，任何地方都没有实现由到期触发的解除/EXPIRE movementType（上文已验证，balanceDerivation.ts 的文档注释明确指出 MOVEMENT_DIRECTION 排除了 EXPIRE）——这是一条尚未实现/设想层面的业务规则，并非当前已强制执行的行为。

## Conditions
合约到达其自身的 expiry_date，且仍有存续的剩余或有余额

## Result
按设计文档：剩余或有余额在 trigger_date = expiry_date + mail_float_grace 时解除

## Example
LC 100,000，已使用 50,000，已到期：剩余的 50,000 在到期日 + mail_float_grace 时解除，而不是在到期日 + 21 天时解除

## Verification Note
已通过 grep 逐字确认设计文档原文。特此明确指出（并非下调状态，因为该声明本身范围就限定为对设计文档的描述，且引用准确）这一点并未在实际运行的微服务中实现——已确认 EXPIRE 确实不存在于 MOVEMENT_DIRECTION 中。读者不应将此处的 CONFIRMED 状态误解为『该规则在实际运行系统中被强制执行』。

## Source Evidence

Implementation:
- `TF_Contingent_Liability_Lifecycle-en.txt §3.9,§7.7`
- `TF_Balance_Component_Spec-en.txt I12`

Tests:
- `TF_Balance_Component_Spec-en.txt §12 T2`

## Related Knowledge
- [[BalanceMovement]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
