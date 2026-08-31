---
knowledge_id: STATUS-RULE-013
title: "findByNaturalKey 在查询场景下可以解析出一个已 CLOSED 的合约；findActiveByNaturalKey 则始终只限于 ACTIVE"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - status
  - confirmed
---

# STATUS-RULE-013 — findByNaturalKey 在查询场景下可以解析出一个已 CLOSED 的合约；findActiveByNaturalKey 则始终只限于 ACTIVE

## 状态
CONFIRMED

## 业务规则
存在两个不同的自然键解析器：findActiveByNaturalKey（仅限 status='ACTIVE'，供每一个创建交易的调用方使用）与 findByNaturalKey（不做状态过滤，按 ACTIVE 优先、其次按 created_at 最新排序，供查询场景使用，从而使一笔已 CLOSED 的信用证的历史记录仍可被查到）。

## 触发条件
调用方所处的场景是查询类（查询当前余额/查询事件）还是创建交易类。

## 结果
一笔已关闭的信用证在查询场景下仍保持可见，但永远无法再被选取用于新的交易；一个在自身此前的 CLOSE 之后被重新 ISSUE 的自然键，会解析到新的 ACTIVE 记录（因 ACTIVE 优先排序），而不是那条已过期的 CLOSED 记录。

## 示例
「关闭信用证 → 释放」之后，对同一 LC 编号执行查询，此前会报错「No Logical Contract exists yet」——通过这一双解析器拆分方案得到修复。

## 验证说明
直接阅读了两个解析方法——findActiveByNaturalKey 按 status='ACTIVE' 过滤；findByNaturalKey 省去该过滤条件，并按 `(status='ACTIVE') DESC, created_at DESC` 排序，与所声称的完全一致。虽未引用针对这一具体配对的直接单元测试，但代码本身已经足够清晰明确——维持 CONFIRMED（仅代码层面证据即已达到 CONFIRMED 的门槛）。

## 来源证据

实现:
- `microservices/balance-component/src/store/balanceContractStore.ts:174-217`

测试:
- （未引用直接测试证据）

## 相关知识
- [[Close Eligibility]]
- [[BalanceContract|BalanceContractStore]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
