---
knowledge_id: MOVEMENT-RULE-003
title: "请求中指定的 Acceptance tenorType，必须与非 Sight 父级自身声明的 tenorType 完全一致"
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

# MOVEMENT-RULE-003 — 请求中指定的 Acceptance tenorType，必须与非 Sight 父级自身声明的 tenorType 完全一致

## 状态
CONFIRMED

## 业务规则
当父级的 tenorType 已设置且不为 SIGHT，并且 Acceptance CREATE 请求也提供了 tenorType 时，二者必须一致——如果不一致（例如父级为 BUYERS_USANCE，但请求为 SELLERS_USANCE），会被拒绝并返回 400。如果任一方缺失（父级没有声明 tenorType——例如遗留数据，或请求中省略了 tenorType），则无从比对，检查直接通过。

## 条件
parentTenorType 已设置 且 parentTenorType !== 'SIGHT' 且 requestedTenorType 已设置 且 requestedTenorType !== parentTenorType

## 结果
ok:false，错误信息中会同时列出双方的 tenorType，并说明二者必须一致。

## 示例
checkAcceptanceTenorConsistency({parentTenorType:'BUYERS_USANCE', requestedTenorType:'SELLERS_USANCE', ...}) => ok:false

## 验证说明
已直接对照源代码确认。已将 api-specs 中的复述条目（"Acceptance 期限流程控制"）合并入本条目及其上方的姊妹规则。

## 来源证据

实现：
- `microservices/balance-component/src/domain/tenorRouting.ts:43-50`
- `microservices/balance-component/src/service/balanceService.ts:919-940`

测试：
- `microservices/balance-component/test/unit/domain/tenorRouting.test.ts:9-34,59-70`
- `test/unit/app.test.ts:1174-1280`

## 相关知识
- [[BalanceMovement]]
- [[checkacceptancetenorconsistency|checkAcceptanceTenorConsistency()]]
- Sight 与 Usance 期限的流程控制
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
