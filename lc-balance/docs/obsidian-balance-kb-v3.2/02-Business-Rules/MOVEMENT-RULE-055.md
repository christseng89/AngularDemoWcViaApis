---
knowledge_id: MOVEMENT-RULE-055
title: "修改本应生成新的合约版本行、而非原地更新 —— 但该机制是死代码，实际运行的 AMEND_INCREASE/AMEND_DECREASE 流程从未调用它"
domain: Balance
category: Business Rule
status: CONFLICT
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - movement
  - conflict
---

# MOVEMENT-RULE-055 — 修改本应生成新的合约版本行、而非原地更新 —— 但该机制是死代码，实际运行的 AMEND_INCREASE/AMEND_DECREASE 流程从未调用它

## 状态
CONFLICT

## 业务规则
Balance-Component-DB-Design.md/.txt 描述了一种修改机制：插入一行新的 balance_contracts 记录（contract_version+1，status=ACTIVE，supersedes_balance_contract_id 指向上一版本），并将上一版本标记为 SUPERSEDED。该机制在 schema 与存储层中确实存在（balance_contracts.contract_version/supersedes_balance_contract_id 字段；BalanceContractStore.listVersions()/markSuperseded() 方法）。然而，在整个 balanceService.ts（该存储层唯一的调用方）中检索，未发现 listVersions() 或 markSuperseded() 的任何调用点——balanceService.ts 中 contractVersion 的唯一用法，是在合约创建时硬编码的 'contractVersion: 1'。在实际运行行为中，AMEND_INCREASE/AMEND_DECREASE/AMEND 均被纯粹处理为针对同一个既有 BalanceContract 的新 BalanceMovement 行（通过 balanceDerivation.ts 的 MOVEMENT_DIRECTION 表求和汇总）——不会产生新的合约行，不会递增版本号，任何已实际执行的代码路径都不会设置 SUPERSEDED 状态。

## 触发条件
设计文档立场：任何修改（Amendment）事件。实际代码立场：同样的事件，但版本化机制从未被触发。

## 结果
CONFLICT —— DB-Design 文档（及其对应的存储层方法）所描述的版本链式修改模型，作为 schema 层的基础设施是真实存在、且经过测试的，但在实际的 createMovement()/release() 业务逻辑路径中却是死代码。若读者仅依据设计文档，会误以为查询 balance_contracts 中 contract_version>1 的记录即可看到修改历史——而在真实系统中，修改历史其实完全体现为针对同一个不变的 BalanceContract 所产生的一连串 BalanceMovement 记录。

## 示例
在 microservices/balance-component/src 中对 'markSuperseded|listVersions' 进行 grep，仅在 balanceContractStore.ts 自身的定义/文档注释中找到匹配——在该存储层唯一的调用方 balanceService.ts 中没有任何调用点。

## 冲突说明
> [!warning] 来源存在分歧
> 这是本轮对抗式复核中的新发现，并非原候选清单中已标记的冲突——原候选项仅依据设计文档断言为 CONFIRMED。经过直接对 balanceService.ts 进行 grep，发现存储层自身的版本化方法在实际业务逻辑中从未被任何地方调用，因而将其降级为 CONFLICT——这是一段死掉的、未被使用的 schema 基础设施，而非对当前修改行为的准确描述。

## 验证说明
这是本轮对抗式复核中的新发现，并非原候选清单中已标记的冲突——原候选项仅依据设计文档断言为 CONFIRMED。经过直接对 balanceService.ts 进行 grep，发现存储层自身的版本化方法在实际业务逻辑中从未被任何地方调用，因而将其降级为 CONFLICT——这是一段死掉的、未被使用的 schema 基础设施，而非对当前修改行为的准确描述。

## 来源证据

实现:
- `microservices/balance-component/src/store/balanceContractStore.ts:219-294 (listVersions/markSuperseded definitions, unused)`
- `microservices/balance-component/src/service/balanceService.ts:1420 (only contractVersion usage, hardcoded to 1)`
- `microservices/balance-component/src/domain/balanceDerivation.ts:17-49 (AMEND_INCREASE/AMEND_DECREASE handled as movement-level signed sums, not contract versioning)`

测试:
- （未引用直接测试证据）

## 相关知识
- [[BalanceMovement]]
- [[Business-Rule-Index]]
- [[Knowledge-Gaps]]
- [[Balance-Traceability-Matrix]]
