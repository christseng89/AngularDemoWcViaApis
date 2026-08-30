---
knowledge_id: STATUS-RULE-006
title: "关闭功能仅限于根票据类型（IPLC_LC / EPLC_LC / EPLC_CONFIRMATION）"
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

# STATUS-RULE-006 — 关闭功能仅限于根票据类型（IPLC_LC / EPLC_LC / EPLC_CONFIRMATION）

## 状态
CONFIRMED

## 业务规则
关闭（A10/B6）仅适用于根 LC/Confirmation。若尝试对一个非根票据（SHGT、IPLC_ACCEPTANCE、EPLC_EXAMINATION 等）执行关闭，会被拒绝——无论是经由 closeShaped 充足性检查路径（createMovement），还是经由 listCloseEligibleContracts() 自身的直接守卫。

## 触发条件
!ROOT_INSTRUMENT_TYPES.has(contract.instrumentType) —— ROOT_INSTRUMENT_TYPES = {IPLC_LC, EPLC_LC, EPLC_CONFIRMATION}。

## 结果
createMovement() 路径：被包装为 InsufficientBalanceError。listCloseEligibleContracts() 路径：直接抛出 RequestValidationError。

## 示例
直接针对一个已释放的 SHGT 合约自身的 balanceContractId 发起 CLOSE 请求，会被以 InsufficientBalanceError 拒绝。

## 验证说明
直接阅读了 ROOT_INSTRUMENT_TYPES 集合以及两个守卫调用点。balance-component-api.yaml v1.16.0 的变更日志作为佐证（而非主要）证据，同样记录了这一限制。未降级。

## 来源证据

实现:
- `microservices/balance-component/src/service/balanceService.ts:99,210-216,488-491`

测试:
- `microservices/balance-component/test/unit/service/closeFunction.test.ts:285-316,476-479`

## 相关知识
- [[Close Eligibility]]
- ROOT_INSTRUMENT_TYPES constant
- movementTypeRegistry — closeShaped handler
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
