---
knowledge_id: MOVEMENT-RULE-025
title: "提交时的 Amount 校验与 monetary amendment 的 Tolerance-only 例外"
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

# MOVEMENT-RULE-025 — 提交时的 Amount 校验与 monetary amendment 的 Tolerance-only 例外

## Status
CONFIRMED

## Business Rule
一般功能的 Amount 必须严格大于 0。A2／B2 monetary amendment 可输入 Amount、Tolerance 或两者；只改
Tolerance 时 Amount 可留空并由客户端送为 `"0"`，但 Amount 为 0 且 Tolerance 未改变的 no-op 会被拒绝。
CLOSE／REOPEN／AMEND_EXPIRY_DATE 等系统零金额规则另由各 movementType 专属逻辑处理。

## Conditions
非 monetary amendment 依各 movementType 的既有规则；monetary amendment 必须 Amount 非零或 Tolerance 有实际变化。

## Result
普通功能 `Amount <= 0` 拒绝；A2／B2 负的画面输入拒绝，空白／0 仅在 Tolerance 改变时通过。

## Example
A1 `amount='0'` 被拒绝；A2 `amount=''`、Tolerance 20→15 通过并送 `amount:'0'`；A2 Amount 0、Tolerance 20→20 被拒绝。

## Verification Note
已直接阅读 `validateMandatoryFields()`／`buildSubmitRequest()` 并以三种输入组合及 no-op 测试核实。

## Source Evidence

实现:
- `src/app/transaction-builder/submit-rules.ts:61-77`

测试:
- `submit-rules.spec.ts:556-606`

## Related Knowledge
- [[BalanceMovement]]
- 通用『金额 > 0』校验，CLOSE 豁免
- assertValidAmount() 服务端兜底校验
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
