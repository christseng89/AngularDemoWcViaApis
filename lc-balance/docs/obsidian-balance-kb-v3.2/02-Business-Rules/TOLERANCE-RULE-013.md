---
knowledge_id: TOLERANCE-RULE-013
title: "checkAmendDecreaseSufficiency 是以经 Tolerance 转换后的 ceilingAmount 与从严可用余额（Tight Available Balance）比较，而非与一般可用余额比较"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - tolerance
  - confirmed
---

# TOLERANCE-RULE-013 — checkAmendDecreaseSufficiency 是以经 Tolerance 转换后的 ceilingAmount 与从严可用余额（Tight Available Balance）比较，而非与一般可用余额比较

## Status
CONFIRMED

## Business Rule
A2 自身的 AMEND_DECREASE 与 B2 自身的减少方向（AMEND 且金额为负数）在校验时，使用的是已经经过 Tolerance 转换的 ceilingAmount（而非原始票面金额），与从严可用余额（Tight Available Balance）比较——绝不能低于已被占用的部分，也绝不能低于尚未结清的表外风险敞口（A2 对应 SHGT，B2 对应 Present Docs Earmark）。

## Conditions
movementType===AMEND_DECREASE（A2）或 AMEND 且金额为负数（B2）。

## Result
若某笔减少操作会使 LC 的 ceiling 缩减至低于其尚未结清的表外风险敞口，则会被拒绝。

## Example
U01 实例演算：Confirmed 100，SG Outstanding 10，一般可用余额 100，从严可用余额 90——一笔金额为 95 的减少操作过去会被错误地放行，现已被正确拒绝。

## Verification Note
相较候选条目仅引用文档的做法，已提升证据质量：独立定位并阅读了 amendDecrease.ts，确认了该规则所描述的具体函数签名与比较逻辑（ceilingAmount 与 tightAvailableBalance 比较，原始票面金额仅用于错误提示信息，从不参与比较本身），与文档注释中的代数证明推理完全吻合。维持并强化为 CONFIRMED。分类提示：本规则实质上是一条修改/减少充分性检查规则（依所述分类法属于 MOVEMENT-RULE 范畴），只是恰好使用了一个由 tolerance 推导出的数值（ceilingAmount）——介于 MOVEMENT-RULE 与 TOLERANCE-RULE 之间的边界情形，仅作提示标记，不予降级。

## Source Evidence

Implementation:
- `microservices/balance-component/src/domain/amendDecrease.ts:38-39 (verified directly: checkAmendDecreaseSufficiency compares params.ceilingAmount against params.tightAvailableBalance, not raw amount)`
- `analysis/Balance-Figures-Calculation-Logic.txt:66-85, 329-346 (design-doc corroboration, as originally cited)`

Tests:
- (no direct test evidence cited)

## Related Knowledge
- [[Tolerance Processing]]
- 从严可用余额（Tight Available Balance）——基于 Confirmed 的公式（2026-08-20 变更）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
