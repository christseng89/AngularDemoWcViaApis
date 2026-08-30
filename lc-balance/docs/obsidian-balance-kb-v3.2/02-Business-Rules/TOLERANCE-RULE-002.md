---
knowledge_id: TOLERANCE-RULE-002
title: "宽容度（Tolerance）换算的工具类型（Instrument-Type）适用性门控"
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

# TOLERANCE-RULE-002 — 宽容度（Tolerance）换算的工具类型（Instrument-Type）适用性门控

## 状态
CONFIRMED

## 业务规则
宽容度换算仅适用于 IPLC_LC、EPLC_LC 与 EPLC_CONFIRMATION 三类合约。其他任何 instrumentType（SHGT、IPLC_ACCEPTANCE、EPLC_ACCEPTANCE，以及由此延伸的 EPLC_EXAMINATION 与其资产端对应项）都会原样返回未经换算的面额，即便 tolerancePct 已填入且 movementType 本身符合适用值。

## 条件
instrumentType ∈ {IPLC_LC, EPLC_LC, EPLC_CONFIRMATION} 是必须首先通过的门控，会先于 movementType 或 tolerancePct 被检查。

## 结果
若 instrumentType 不在此集合内，computeCeilingAmount 会原样返回 faceAmount。

## 示例
amount='50000', tolerancePct='10', movementType='ISSUE', instrumentType='SHGT' -> ceilingAmount='50000'（不变）

## 验证说明
已直接对照源码与测试文件验证。未降级——这是一个单一、清晰的门控，针对特别指出的 SHGT 场景有直接测试覆盖。

## 来源证据

实现：
- `microservices/balance-component/src/domain/tolerance.ts:32`
- `microservices/balance-component/src/domain/tolerance.ts:56-58`

测试：
- `microservices/balance-component/test/unit/domain/tolerance.test.ts:44-47 (verified — SHGT/IPLC_ACCEPTANCE both tested unchanged)`

## 相关知识
- [[Tolerance Processing]]
- TOLERANCE_APPLICABLE_INSTRUMENT_TYPES
- SG／押汇（Bills）金额永远是面额，绝不做宽容度调整
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
