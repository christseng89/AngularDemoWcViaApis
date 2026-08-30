---
knowledge_id: EXPOSURE-RULE-011
title: "已 RELEASED 但尚未被消费的 Present Docs Presentation 会阻塞 Export（B6）的 Close 资格判定"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 分析快照中没有 .git 历史记录，参见 [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - exposure
  - confirmed
---

# EXPOSURE-RULE-011 — 已 RELEASED 但尚未被消费的 Present Docs Presentation 会阻塞 Export（B6）的 Close 资格判定

## 状态
CONFIRMED

## 业务规则
对于 EPLC_CONFIRMATION 而言，一笔 EPLC_EXAMINATION/CREATE 异动，若其 status 已是 RELEASED（B3 经 Checker 核准）但 presentDocsConsumedAt 仍为 null（表示 B4 尚未 Honour/Accept 该单据），则会被视为一个未结事件并阻塞 Close——单凭 status 为 RELEASED 并不足以证明该敞口已完全解决。仅扫描 PENDING 状态会遗漏这种情形。

## 条件
m.status === 'RELEASED' && m.movementType === 'CREATE' && !m.presentDocsConsumedAt，且该异动是 EPLC_CONFIRMATION 下的 Examination 子项。

## 结果
在 evaluateContractCloseEligibility() 内部 hasOpenEvents = true，以「尚未完全解决」为由阻塞 Close——同时支撑 Step-1 选择器提示、createMovement() 的检查、以及 release() 自身的复核，三处逻辑均以此为依据。

## 示例
CLOSE-B6-002：一笔已 released 的 Examination CREATE（5000）从未被 B4 的 HONOUR/ACCEPT 消费，即便它已不处于 PENDING 状态，仍会阻塞 Close。

## 验证说明
已直接通读 evaluateContractCloseEligibility() 核实——逻辑准确无误，行号在该函数实际范围内准确（431-465，候选引用的 448-458 确实落在其中）。无需下调评级。

## 原始码证据

实现：
- `microservices/balance-component/src/service/balanceService.ts:431-465 (verified read: evaluateContractCloseEligibility，确认针对 EPLC_CONFIRMATION 的 RELEASED+!presentDocsConsumedAt 检查，行号与候选引用的 448-458 范围相符)`

测试：
- `microservices/balance-component/test/unit/service/closeFunction.test.ts:365-399 (未在本轮重新通读，但依据已验证的实现，行数/位置合理可信)`

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- evaluateContractCloseEligibility()（私有 service 方法，共 3 处调用点）
- domain/closeEligibility.ts
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
