---
knowledge_id: EXPOSURE-RULE-002
title: "checkUtilizeSufficiency（A3/A3S/B4 的 UTILIZE-HONOUR-ACCEPT）——两级硬性 ERROR：先比对 plain Available，再比对 Tight Available"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - exposure
  - confirmed
---

# EXPOSURE-RULE-002 — checkUtilizeSufficiency（A3/A3S/B4 的 UTILIZE-HONOUR-ACCEPT）——两级硬性 ERROR：先比对 plain Available，再比对 Tight Available

## 状态
CONFIRMED

## 业务规则
如果 requestedAmount 超出了 plain 的 availableBalance，则会被拒绝（409，ok:false）；如果它独立地额外超出了 tightAvailableBalance = confirmedBalance − pendingDecreaseTotal − offBalanceExposure，同样会被拒绝。两者都是硬性拒绝（在当前代码中不存在任何非阻断性的预警路径——结果类型上的 `warning` 字段已名存实亡，这与 OAS 自身从 v1.0.0 起就刻意省略 BalanceMovement.warnings 的做法一致）。A3S 匹配到的 SG 赎回之所以能够避免触发 tight 级别的拒绝，仅仅是因为调用方已经在调用本函数之前，通过前述合并后的表外风险敞口规则中的 matched-businessEventId 机制，预先抵扣了该 SG 的风险敞口——本函数自身并没有任何针对该情形的特殊处理。

## 触发条件
requestedAmount > availableBalance，或者 requestedAmount > (confirmedBalance − pendingDecreaseTotal − offBalanceExposure)。

## 结果
{ok:false, error}，会区分具体触发了哪一级阈值；tight 级别的错误信息会明确建议使用 "Document Arrival w/ Shipping Gtee"（即 A3S）来抵扣某个特定 SG 已预留的额度。

## 示例
availableBalance=121000，confirmedBalance=121000，offBalanceExposure=100000，requestedAmount=50000 → tightAvailableBalance=21000 → 即便 50000 ≤ 121000 的 Available，仍会被拒绝。

## 验证说明
合并了风险敞口域候选项与几乎相同的 api-specs 候选项（"UTILIZE 的表外检查是硬性 ERROR，而非预警"）——同一条规则分别从代码与 OAS 两处得到陈述。直接阅读了完整的函数体；内容与两个候选项完全一致，无需降级。

## 来源证据

实现:
- `microservices/balance-component/src/domain/offBalanceExposure.ts:261-312 (verified read in full)`

测试:
- `microservices/balance-component/test/unit/domain/offBalanceExposure.test.ts:82-172`

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- checkUtilizeSufficiency 两级硬性 ERROR 门禁（v0.12）
- 设计文档 §6.1 已将 WARNING 强化为 ERROR
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
