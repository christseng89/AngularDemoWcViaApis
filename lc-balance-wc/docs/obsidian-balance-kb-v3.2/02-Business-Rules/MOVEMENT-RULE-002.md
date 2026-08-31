---
knowledge_id: MOVEMENT-RULE-002
title: "Sight 期限的父级 LC 会直接阻断任何子级 Acceptance 的 CREATE"
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

# MOVEMENT-RULE-002 — Sight 期限的父级 LC 会直接阻断任何子级 Acceptance 的 CREATE

## 状态
CONFIRMED

## 业务规则
如果父级 LC/Confirmation 自身声明的 tenorType（在 ISSUE 时设定）为 SIGHT，checkAcceptanceTenorConsistency() 会始终返回 ok:false——一笔 Sight 提示（presentation）只能单独通过 UTILIZE（A4）结算，无论 Acceptance CREATE 请求本身指定了什么 tenorType，都绝不能走 Acceptance（A5/A6）流程。这一规则在服务器端的 resolveOrCreateContract()（balanceService.ts）中强制执行，以 400 RequestValidationError 的形式返回，并已由 OAS 规格以及一个路由层端到端（e2e）测试独立确认。

## 条件
parentTenorType === 'SIGHT'

## 结果
ok:false，错误信息中注明父级合约 id，并说明『Sight -> A4，绝不走 A5』；在 HTTP 层表现为 400 REQUEST_VALIDATION_FAILED。

## 示例
checkAcceptanceTenorConsistency({parentTenorType:'SIGHT', parentBalanceContractId:'bc-sight-1', requestedTenorType: undefined}) => {ok:false, error: 'Cannot Create Acceptance under a Sight LC ...'}

## 验证说明
已直接阅读 tenorRouting.ts 及 balanceService.ts 中的调用位置；二者均与所述内容完全一致。已将 3 条分别来自服务编排、api-specs、routes-e2e-test 三个角度、描述同一规则的重复/重叠候选条目合并为本条目，并合并了它们各自的证据。

## 来源证据

实现：
- `microservices/balance-component/src/domain/tenorRouting.ts:34-41`
- `microservices/balance-component/src/service/balanceService.ts:919-940 (call site)`

测试：
- `microservices/balance-component/test/unit/domain/tenorRouting.test.ts:36-57`
- `test/unit/app.test.ts:1174-1280`

## 相关知识
- [[BalanceMovement]]
- [[checkacceptancetenorconsistency|checkAcceptanceTenorConsistency()]]
- Sight 与 Usance 期限的流程控制
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
