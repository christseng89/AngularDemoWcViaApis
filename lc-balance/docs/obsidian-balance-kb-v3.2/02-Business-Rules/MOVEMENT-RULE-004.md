---
knowledge_id: MOVEMENT-RULE-004
title: "赎回／结算的充足性检查以 Available Balance 为准，而非静态的 Confirmed Balance"
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

# MOVEMENT-RULE-004 — 赎回／结算的充足性检查以 Available Balance 为准，而非静态的 Confirmed Balance

## 状态
CONFIRMED

## 业务规则
任何用于清偿未偿余额的赎回／结算／资产side清账 movement（SHGT 的 PARTIAL_REDEEM/FULL_REDEEM、Acceptance 的 PARTIAL_SETTLE/FULL_SETTLE，以及资产side的 REIMBURSE/RECLASSIFY_OUT——均通过 movementTypeRegistry 中的 'outstandingCapped' 分类，统一走 checkRedeemSufficiency）都不得超过目标记录的 Available Balance——即 Confirmed Balance 减去针对同一记录、当前仍处于 PENDING 状态的其他赎回／结算已预留的金额。经查（2026-08-15）发现，若以静态的、仅统计 RELEASED 状态的 Confirmed Balance 为基准，会导致同一笔未偿金额在两个并发的 PENDING 请求中被重复赎回。

## 条件
redeemAmount（ceilingAmount）> sgAvailableBalance

## 结果
若超出则拒绝，错误信息中会同时列出提交的金额与 Available Balance 数值；否则接受（创建为 PENDING 状态的 movement）。

## 示例
LC S001 的 SG G01：先有一笔 7,000 的 FULL_REDEEM 处于 PENDING 状态，随后在旧的『以 Confirmed Balance 为基准』的逻辑下，一笔针对同一 SG 的 5,000 PARTIAL_REDEEM 被错误地接受了（合计 12,000，超出了 7,000 的未偿余额）——已通过将检查基准改为 Available Balance 修复。

## 验证说明
已完整阅读 shgtRedeem.ts；其文档注释与函数主体均与所述内容完全一致，包括所引用的具体历史缺陷数字。

## 来源证据

实现：
- `microservices/balance-component/src/domain/shgtRedeem.ts:1-40`
- `microservices/balance-component/src/service/balanceService.ts:197-198,247`

测试：
- （未引用直接测试证据）

## 相关知识
- [[BalanceMovement]]
- [[checkredeemsufficiency|checkRedeemSufficiency()]]
- RedeemCheckResult（可辨识联合类型）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
