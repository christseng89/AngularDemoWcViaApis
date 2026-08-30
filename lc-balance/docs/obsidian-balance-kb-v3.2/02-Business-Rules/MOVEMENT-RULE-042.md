---
knowledge_id: MOVEMENT-RULE-042
title: "各 instrumentType 下 movementType 的合法性由调用方自行负责，微服务并未在通用层面强制校验"
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

# MOVEMENT-RULE-042 — 各 instrumentType 下 movementType 的合法性由调用方自行负责，微服务并未在通用层面强制校验

## Status
CONFIRMED

## Business Rule
该微服务本身并未在服务端对每种 instrumentType 强制实施一份通用的 movementType 允许清单——合法组合的映射关系归属于调用方/Channel API 层。服务端仅仅是把每一个已接受的 movementType 归入行为分组（movementTypeRegistry），供其自身的余额方向/充足性计算使用。需要注意的是，这一说法是有限定条件的，而非绝对——针对特定的字段组合，服务端确实存在具体校验（例如 Acceptance 的期限一致性、CLOSE 自身在 closeShaped 中仅限根 instrumentType 的门槛校验）——OAS 中的这一说法描述的是通用/默认情形，而不是『完全不存在任何组合校验』。

## Conditions
适用于未命中某个具体命名的跨字段校验（期限一致性、CLOSE 资格等）的 POST /balance-movements 调用

## Result
若调用方绕过 Channel API，可以直接向该微服务提交一个未被专门校验、但实际上不合法的 instrumentType/movementType 组合，仅凭这一点服务端不会拒绝

## Example
不适用

## Verification Note
相对于原始表述，本轮对其绝对性做了轻微下修：本轮直接发现服务端确实存在若干 movementType/instrumentType 组合校验（Acceptance 期限一致性、CLOSE 仅限 ROOT_INSTRUMENT_TYPES 的门槛校验、SHGT/EPLC_EXAMINATION 创建时的注册表校验）。该规则作为对『通用情形』（不存在一份笼统的允许清单）的描述是正确的，但 OAS 自身笼统的措辞需要加上这一限定，以避免夸大这一缺口。限定版本的状态维持 CONFIRMED。

## Source Evidence

Implementation:
- `analysis/balance-component-api.yaml:1361`
- `microservices/balance-component/src/service/balanceService.ts (movementTypeRegistry, closeShaped, tenorRouting checks)`

Tests:
- （未引用直接测试证据）

## Related Knowledge
- [[BalanceMovement]]
- Microservice OAS Endpoint Inventory
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
