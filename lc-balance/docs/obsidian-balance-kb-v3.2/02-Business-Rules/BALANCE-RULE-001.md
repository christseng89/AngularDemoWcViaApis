---
knowledge_id: BALANCE-RULE-001
title: "已确认余额（Confirmed Balance）= 所有状态为 RELEASED 的变动记录（movement）的 ceilingAmount × MOVEMENT_DIRECTION 之和"
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

# BALANCE-RULE-001 — 已确认余额（Confirmed Balance）= 所有状态为 RELEASED 的变动记录（movement）的 ceilingAmount × MOVEMENT_DIRECTION 之和

## 状态
CONFIRMED

## 业务规则
只有状态为 RELEASED 的变动记录才计入已确认余额；每笔变动记录贡献其 ceilingAmount（而非原始 amount），乘以 +1（增加型 movementType）或 -1（减少型 movementType），具体取决于 MOVEMENT_DIRECTION 对照表。该字段对每一种 instrumentType 都会填充。

## 触发条件
movement.status === 'RELEASED'

## 结果
已确认余额 = Σ（RELEASED 变动记录的 ceilingAmount × 方向）

## 示例
ISSUE（RELEASED，ceiling 110000）+ UTILIZE（RELEASED，ceiling 50000，方向 -1）+ UTILIZE（PENDING，ceiling 20000，被排除）=> 已确认余额 = 60000

## 验证说明
合并了 3 个描述同一公式的重复候选项（balance-core-domain、api-specs、design-docs-figures-mapping）。直接重新阅读了 balanceDerivation.ts 及其测试——代码与测试与该论断完全一致。属于最强证据等级（可执行代码 + 通过的测试 + 2 个独立文档来源三者一致）。

## 来源证据

实现:
- `microservices/balance-component/src/domain/balanceDerivation.ts:17-49 (MOVEMENT_DIRECTION), 65-68 (computeConfirmedBalance)`
- `analysis/balance-component-api.yaml:672-681`
- `analysis/Balance-Figures-Calculation-Logic.md (Figure #1)`

测试:
- `microservices/balance-component/test/unit/domain/balanceDerivation.test.ts:10-18`

## 相关知识
- [[Balance Derivation Rules]]
- MOVEMENT_DIRECTION 查找表
- [[computeconfirmedbalance|computeConfirmedBalance()]]
- 五大核心余额指标（Five Core Balance Figures）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
