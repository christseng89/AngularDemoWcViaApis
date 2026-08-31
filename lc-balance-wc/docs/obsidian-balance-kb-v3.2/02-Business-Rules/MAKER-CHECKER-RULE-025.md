---
knowledge_id: MAKER-CHECKER-RULE-025
title: "A3S 在 LC UTILIZE 分腿失败时，会自动回滚（补偿性撤销）SG 赎回分腿"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - maker-checker
  - confirmed
---

# MAKER-CHECKER-RULE-025 — A3S 在 LC UTILIZE 分腿失败时，会自动回滚（补偿性撤销）SG 赎回分腿

## 状态
CONFIRMED

## 业务规则
A3S 的复合式提交会先建立配对的 SG 赎回记录（仍为 PENDING），再建立 LC 自身的 UTILIZE，两者共用同一个生成的 businessEventId。若 SG 赎回成功，但随后 LC 分腿失败，服务会自动对刚建立的 SG 赎回调用 api.cancel()（原因代码为 AUTO_ROLLBACK_LC_LEG_FAILED），使该 SG 的额度立即可再次使用，而不是让它以孤立的 PENDING 状态遗留下来。若这次补偿性撤销本身也失败，两则错误讯息会一并呈现，并明确指引使用者改以 A9 自身的复核人（Checker）面板，作为拒绝该笔孤立赎回记录的人工兜底手段。

## 条件
已选择 documentArrivalWithSg 形态，且 SG 赎回的 createMovement 成功，而随后 LC UTILIZE 的 createMovement 失败。

## 结果
会调用 api.cancel(sgRedeemMovementId, createdBy, 'AUTO_ROLLBACK_LC_LEG_FAILED')；结果一律为 'failed'，secondary:{} 为空（没有任何东西留给复核人处理），result 缺失——讯息内容依回滚本身是否成功而有所不同。

## 示例
已实际重现：A1 100 -> A8 SG 10 -> A3S 15，针对超出限额的汇票金额——SG 赎回分腿先行成功，随后 LC 分腿失败，在此修正推出之前，会使 SG 赎回记录以孤立 PENDING 状态遗留。

## 验证说明
已由 CLAUDE.md 自身描述完全相同的实况重现场景与修正方式的决策日志条目逐字佐证。已确认。

## 来源证据

实现：
- `src/app/transaction-builder/maker-submit.service.ts:87-150 (submitDocumentArrivalWithSg + rollbackArrivalSgRedeem)`

测试：
- `src/app/transaction-builder/maker-submit.service.spec.ts:241-286`

## 相关知识
- [[Maker Checker Lifecycle]]
- [[MakerSubmitService]]
- MakerSubmitOutcome 判别式联合类型（discriminated union）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
