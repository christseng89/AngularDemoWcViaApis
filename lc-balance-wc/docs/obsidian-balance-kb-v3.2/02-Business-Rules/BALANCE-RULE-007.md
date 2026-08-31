---
knowledge_id: BALANCE-RULE-007
title: "严格可用余额（Tight Available Balance）由已确认余额（而非可用余额）推导得出，再减去待处理减少总额，再减去表外风险敞口——自 2026-08-20 / v1.13.0 起生效"
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

# BALANCE-RULE-007 — 严格可用余额（Tight Available Balance）由已确认余额（而非可用余额）推导得出，再减去待处理减少总额，再减去表外风险敞口——自 2026-08-20 / v1.13.0 起生效

## 状态
CONFIRMED

## 业务规则
对于 IPLC_LC/EPLC_LC：严格可用余额 = 已确认余额 − 待处理减少总额 − 表外风险敞口（SHGT）。对于 EPLC_CONFIRMATION：严格可用余额 = 已确认余额 − 待处理减少总额 − 合计交单占用额（Pending+Approved）。对于其他所有 instrumentType，该值为 null。一笔仍处于 PENDING 状态的增加不会提升严格可用余额，直到其被 Released 为止；而一笔仍处于 PENDING 状态的减少则会立即占用该额度（业务指示"只有 APPROVED 才可以动用"）。

## 触发条件
instrumentType ∈ {IPLC_LC, EPLC_LC, EPLC_CONFIRMATION}

## 结果
tightAvailableBalance = confirmed.minus(pendingDecreaseTotal).minus(exposureOrEarmark)——这是每一笔 UTILIZE/HONOUR/ACCEPT、SHGT ISSUE、EPLC_EXAMINATION CREATE，以及 AMEND_DECREASE / Confirmation 侧 AMEND 减少的充足性检查所比对的额度上限

## 示例
v1.13.0 更新日志：计算基准由 availableBalance 改为 confirmedBalance，业务指示依据为"只有 APPROVED 才可以动用"。

## 验证说明
合并了 3 个重复候选项（api-specs ×1、design-docs-figures-mapping ×1）。直接重新阅读了 balanceService.ts 的 assembleSnapshot() 以及 OAS 中 tightAvailableBalance 字段的说明——两者与该论断逐字一致，且与设计文档的 Figure #5 完全吻合。属于最强证据等级：可执行代码（两个独立写入点）+ API 规范 + 设计文档，三者一致。

## 来源证据

实现:
- `microservices/balance-component/src/service/balanceService.ts:266-281,299-305,585-631 (assembleSnapshot, both formulas)`
- `analysis/balance-component-api.yaml:398-412,1662-1688`
- `analysis/Balance-Figures-Calculation-Logic.md (Figure #5)`

测试:
- （未引用直接测试证据）

## 相关知识
- [[Balance Derivation Rules]]
- 已确认／可用／严格可用余额推导
- computeOffBalanceExposure
- computePresentDocsEarmark
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
