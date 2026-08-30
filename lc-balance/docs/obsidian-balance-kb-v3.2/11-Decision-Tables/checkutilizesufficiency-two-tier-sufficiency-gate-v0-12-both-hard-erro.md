---
knowledge_id: checkutilizesufficiency-two-tier-sufficiency-gate-v0-12-both-hard-erro
title: "checkUtilizeSufficiency——双层充足性门禁（v0.12，两层均为硬性 ERROR）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# checkUtilizeSufficiency——双层充足性门禁（v0.12，两层均为硬性 ERROR）

| 检查顺序 | 条件 | 结果 | 备注 |
|---|---|---|---|
| 1 | requestedAmount > availableBalance | ERROR | "超出可用余额"——无论表外风险敞口如何都会检查 |
| 2 | requestedAmount ≤ availableBalance 且 requestedAmount > (confirmedBalance − pendingDecreaseTotal − offBalanceExposure) | ERROR | "超出紧口径可用余额"——v0.10/v0.11 中原为 WARNING，v0.12 中已强化为 ERROR；错误信息建议以「单据到达（含装船保函）」（A3S）作为解决方案 |
| — | requestedAmount 未超出上述两个阈值 | OK | ok:true，warning 字段实际从未被填充过（属遗留残留字段） |

## 来源证据

- `microservices/balance-component/src/domain/offBalanceExposure.ts:282-312`
- `test/unit/domain/offBalanceExposure.test.ts:82-172`

## 相关知识

- [[Off-Balance-Sheet Exposure|Off-Balance-Sheet Exposure & Contingent Account Entries]]
- [[Business-Rule-Index]]
