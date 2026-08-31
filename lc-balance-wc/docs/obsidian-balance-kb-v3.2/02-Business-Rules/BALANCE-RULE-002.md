---
knowledge_id: BALANCE-RULE-002
title: "可用余额（Available Balance）= 已确认余额 ± 所有 PENDING 变动记录之和；在一笔简单变动记录自身的 Submit→Release 转换过程中总额保持不变"
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

# BALANCE-RULE-002 — 可用余额（Available Balance）= 已确认余额 ± 所有 PENDING 变动记录之和；在一笔简单变动记录自身的 Submit→Release 转换过程中总额保持不变

## 状态
CONFIRMED

## 业务规则
可用余额在已确认余额的基础上，叠加所有当前处于 PENDING 状态的变动记录的净签名 ceilingAmount 贡献。对于单笔非复合的变动记录而言，这意味着可用余额在 Submit（即 PENDING）阶段就已经完整反映了该笔变动记录的全部影响——将同一笔变动记录推进到 RELEASED 并不会改变总额，只会使其内部 PENDING 与 Confirmed 的构成发生迁移。

## 触发条件
movement.status === 'PENDING'，在单独计算出的已确认余额基础上求和

## 结果
可用余额 = confirmedBalance + Σ(ceilingAmount × 方向) （PENDING 变动记录之和）；当一笔简单变动记录由 PENDING 转为 RELEASED 时，总额在数值上保持不变

## 示例
已确认余额 110000，一笔 PENDING 状态的 UTILIZE，ceiling 30000（方向 -1）=> 可用余额 = 80000。A1 LC Issue：可用余额在 Submit 时增加 ceilingAmount，在 Approve 时不变。

## 验证说明
合并了 3 个重复候选项。「跨越 Release 保持不变」这一子论断在原始候选项中仅有文档依据；直接重新阅读了 Balance-Figures-Calculation-Logic.txt §5，确认其明确、且与公式一致地陈述了这一点。未降级——代码 + 测试覆盖核心公式，文档进一步印证了这一推导出的不变性质。

## 来源证据

实现:
- `microservices/balance-component/src/domain/balanceDerivation.ts:70-77`
- `analysis/balance-component-api.yaml:672-681`
- `analysis/Balance-Figures-Calculation-Logic.md (Figure #2, §5 general pattern)`

测试:
- `microservices/balance-component/test/unit/domain/balanceDerivation.test.ts:26-33`

## 相关知识
- [[Balance Derivation Rules]]
- [[computeavailablebalance|computeAvailableBalance()]]
- 五大核心余额指标（Five Core Balance Figures）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
