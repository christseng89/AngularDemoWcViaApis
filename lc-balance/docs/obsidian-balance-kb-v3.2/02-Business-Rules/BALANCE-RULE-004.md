---
knowledge_id: BALANCE-RULE-004
title: "待处理减少总额（Pending Decrease Total）只汇总同一合约上 PENDING 变动记录中的负向部分，绝不会与 PENDING 状态的增加相互抵销"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - balance
  - confirmed
---

# BALANCE-RULE-004 — 待处理减少总额（Pending Decrease Total）只汇总同一合约上 PENDING 变动记录中的负向部分，绝不会与 PENDING 状态的增加相互抵销

## 状态
CONFIRMED

## 业务规则
computePendingDecreaseTotal() 只以正数形式汇总那些签名后的 MOVEMENT_DIRECTION 贡献为负（即减少型）的 PENDING 变动记录。PENDING 状态的增加不作任何贡献，且绝不允许在同一合约上抵销 PENDING 状态的减少（"增加从严，占用从宽"）。该值供严格可用余额（Tight Available Balance）的减项使用，在 balanceService.ts 的 assembleSnapshot() 中计算。

## 触发条件
movement.status === 'PENDING' 且 signedAmount(movement) 为负

## 结果
pendingDecreaseTotal = Σ |signedAmount|（符合条件的 PENDING 变动记录之和）

## 示例
在 balanceDerivation.test.ts 中没有专门的单元测试覆盖——该行为直接取自源代码实现（第 92-99 行）及其文档注释；通过 balanceService.ts 的调用点及服务层测试夹具（closeFunction.test.ts、test/unit/helpers/scenarioLedger.ts）被大量间接验证。

## 验证说明
合并了 2 个重复候选项（balance-core-domain、design-docs-figures-mapping）。确认 balanceDerivation.test.ts 中确实不存在专门的单元测试，这一点原始候选项自身也已披露。代码清晰且自洽，被 balanceService.ts 大量依赖（通过 grep 确认了多个真实调用点），并与设计文档自身的图示描述逐字吻合——尽管缺少专门的单元测试，仍维持 CONFIRMED，因为该实现简单、经过直接阅读，且被许多通过的服务层测试间接验证。

## 来源证据

实现:
- `microservices/balance-component/src/domain/balanceDerivation.ts:79-99`
- `microservices/balance-component/src/service/balanceService.ts:266,299,585`
- `analysis/Balance-Figures-Calculation-Logic.md (Figure #5a)`

测试:
- （未引用直接测试证据）

## 相关知识
- [[Balance Derivation Rules]]
- [[computependingdecreasetotal|computePendingDecreaseTotal()]]
- 严格可用余额（Tight Available Balance）
- 已确认／可用／面值金额余额指标
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
