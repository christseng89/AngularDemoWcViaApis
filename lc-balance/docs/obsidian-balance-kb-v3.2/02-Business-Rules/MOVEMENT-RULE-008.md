---
knowledge_id: MOVEMENT-RULE-008
title: "基于 Tight Available 的 AMEND_DECREASE 检查被断言（本文未独立重新证明）为已涵盖面值转负下限检查"
domain: Balance
category: Business Rule
status: INFERRED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - movement
  - inferred
---

# MOVEMENT-RULE-008 — 基于 Tight Available 的 AMEND_DECREASE 检查被断言（本文未独立重新证明）为已涵盖面值转负下限检查

## 状态
INFERRED

## 业务规则
代码中并不存在一个单独用于防止『减额将面值驱动为负数』的检查——代码依赖的是唯一一项检查（ceilingAmount 与 tightAvailableBalance 的比较），domain 层文档注释声称，只要 tolerancePct ≥ 0，该检查在代数上就等价于那个下限检查。

## 条件
注释中假定的前提条件：tolerancePct ≥ 0——在本代码库中并未作为一个独立的代数命题被重新推导或单元测试验证过。

## 结果
代码中将『针对 Tight Available Balance 的这一项检查』视为足以同时捕获『超额减少』与『面值转负』这两种场景；整条调用路径中不存在第二个、冗余的下限检查。

## 示例
不适用——根据源代码注释，这是一个代数层面的论证，而非具体数值示例。

## 验证说明
已从 CONFIRMED 下调为 INFERRED：『不存在第二项检查』这一点，在代码中是可以直接观察到的（属于已确认的事实）；但『这唯一一项检查在数学上足以捕获每一种面值转负场景』这一论断，完全建立在一条未经测试的源代码注释的代数断言之上（证据优先级第 6 级，最低），且没有任何测试针对『面值转负』场景断言该路径确实能够捕获到它。『存在一项检查、不存在第二项检查』这一半是 CONFIRMED 的；而『且这一项检查已被证明足够』这一半，其可信度仅相当于一条未经验证的注释，因此整体定性为 INFERRED。

## 来源证据

实现：
- `microservices/balance-component/src/domain/amendDecrease.ts:1-14`

测试：
- （未引用直接测试证据）

## 相关知识
- [[BalanceMovement]]
- [[checkamenddecreasesufficiency|checkAmendDecreaseSufficiency()]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
