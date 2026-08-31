---
knowledge_id: MOVEMENT-RULE-009
title: "Re-ISSUE 防护——针对一个已处于 ACTIVE 状态的自然键提交创建型 movementType，会被拒绝"
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

# MOVEMENT-RULE-009 — Re-ISSUE 防护——针对一个已处于 ACTIVE 状态的自然键提交创建型 movementType，会被拒绝

## 状态
CONFIRMED

## 业务规则
当 resolveOrCreateContract() 是通过 req.naturalKey（而非通过显式的 balanceContractId）解析出一份既有合约，且请求的 movementType 在 movementTypeRegistry 中被标记为 'isCreating'（即 ISSUE 或 CREATE）时，该请求会被拒绝，并抛出 NaturalKeyAlreadyExistsError，引导调用方改用 AMEND_INCREASE/AMEND_DECREASE（对 EPLC_CONFIRMATION 而言则是 AMEND）。这可以防止本应是同一份逻辑合约（Logical Contract），却因两笔 ISSUE movement 而导致 Ceiling/Confirmed Balance 被重复计数。该限制仅作用于 naturalKey 路径——显式指定 balanceContractId 的情况不受此限制。

## 条件
合约是通过 req.naturalKey 解析得到的 且 movementTypeRegistry[req.movementType]?.isCreating 为真

## 结果
返回 409/NaturalKeyAlreadyExistsError，其中注明 instrumentType、自然键，以及既有的 balanceContractId。

## 示例
A1 Issue LC 'S10-001' 成功；针对同一 lcNumber（自然键）再次尝试 A1 Issue，会抛出 NaturalKeyAlreadyExistsError。

## 验证说明
已阅读完整的 resolveOrCreateContract() 函数；与所述内容完全一致，包括限定范围这一细节。

## 来源证据

实现：
- `microservices/balance-component/src/service/balanceService.ts:871-892`

测试：
- （未引用直接测试证据）

## 相关知识
- [[BalanceMovement]]
- movementTypeRegistry（用于 movementType 分类的策略／类型对象注册表）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
