---
knowledge_id: TOLERANCE-RULE-004
title: "双重门控（instrumentType 且 movementType）碰撞防护——防止 SHGT 自身的 ISSUE 被误认为是 LC 的 ISSUE"
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

# TOLERANCE-RULE-004 — 双重门控（instrumentType 且 movementType）碰撞防护——防止 SHGT 自身的 ISSUE 被误认为是 LC 的 ISSUE

## 状态
CONFIRMED

## 业务规则
宽容度门控刻意将 instrumentType 与 movementType 一并检查，绝不单独只检查 movementType，因为 SHGT 自身的 ISSUE movementType 与 LC 的 ISSUE 在传输字符串上是完全相同的。如果只检查 movementType，一旦调用方误将 tolerancePct 附加到某份 SHGT 合约上，海运保函（Shipping Guarantee）的金额就会被悄无声息地按宽容度百分比上调。这一双重门控的形态，正是上面工具类型门控与资金变动类型门控二者共同依赖的底层机制，而不是一条独立的规则。

## 条件
instrumentType='SHGT' 且 movementType='ISSUE' 且 tolerancePct 非空——instrumentType 门控（最先被检查）会在 movementType 或 tolerancePct 甚至尚未被考虑之前，就先拒绝 SHGT。

## 结果
无论 movementType/tolerancePct 为何，对 SHGT 都原样返回 faceAmount。

## 示例
amount='50000', tolerancePct='10', movementType='ISSUE', instrumentType='SHGT' -> ceilingAmount='50000'（而非 '55000'）

## 验证说明
合并了两个候选规则：源自代码的『SHGT/LC 碰撞防护』规则，以及源自设计文档（Balance-Figures-Calculation-Logic.txt）、从需求侧描述同一机制的『instrumentType 与 movementType 双重门控』规则。两者相互印证同一事实且不存在矛盾；代码与测试是主要证据，文档与之一致。保持 CONFIRMED。

## 来源证据

实现：
- `microservices/balance-component/src/domain/tolerance.ts:19-26 (doc comment explicitly states the rationale)`
- `microservices/balance-component/src/domain/tolerance.ts:56-58 (instrumentType gate, checked before movementType)`

测试：
- `microservices/balance-component/test/unit/domain/tolerance.test.ts:44-45 (SHGT ISSUE with tolerancePct='10' -> unchanged, verified)`

## 相关知识
- [[Tolerance Processing]]
- [[InstrumentType|双重门控（instrumentType 且 movementType）碰撞防护]]
- TOLERANCE_APPLICABLE_INSTRUMENT_TYPES
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
