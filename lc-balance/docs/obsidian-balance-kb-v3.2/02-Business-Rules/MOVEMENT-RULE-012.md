---
knowledge_id: MOVEMENT-RULE-012
title: "承兑期限（Acceptance Tenor）一致性在 resolveOrCreateContract() 内部由服务端强制校验，而非依赖客户端自觉遵守"
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

# MOVEMENT-RULE-012 — 承兑期限（Acceptance Tenor）一致性在 resolveOrCreateContract() 内部由服务端强制校验，而非依赖客户端自觉遵守

## Status
CONFIRMED

## Business Rule
在 parentLogicalContractId 下创建新的 IPLC_ACCEPTANCE/EPLC_ACCEPTANCE CREATE 时，checkAcceptanceTenorConsistency() 会将请求中的 tenorType 与已解析的父合同自身的 tenorType 进行比较，若不一致则拒绝（抛出 RequestValidationError）——该校验在服务端强制执行，因此即便 Maker 完全绕过 Angular 客户端直接调用接口，也无法创建与流程不一致的 Acceptance。

## Conditions
instrumentType 为 IPLC_ACCEPTANCE/EPLC_ACCEPTANCE，movementType 为 CREATE，且提供了 parentLogicalContractId

## Result
针对 Sight 类型父合同，或 tenorType 不一致的情况，返回 400 RequestValidationError

## Example
某父 LC 开立时 tenorType 为 SELLERS_USANCE；若一个 Acceptance CREATE 请求针对该父合同携带了 tenorType BUYERS_USANCE，则会被拒绝

## Verification Note
本条目是上文两条 tenorRouting.ts 规则在服务层调用点上的对应表述；之所以保留为独立条目，是因为它记录了具体的调用点接线方式（即由哪个合同解析分支触发该检查），并已直接对照源码验证。

## Source Evidence

实现:
- `microservices/balance-component/src/service/balanceService.ts:919-940`

测试:
- （未引用直接测试证据）

## Related Knowledge
- [[BalanceMovement]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
