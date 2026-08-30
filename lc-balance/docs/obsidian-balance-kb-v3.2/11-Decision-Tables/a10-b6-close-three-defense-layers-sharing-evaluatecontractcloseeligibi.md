---
knowledge_id: a10-b6-close-three-defense-layers-sharing-evaluatecontractcloseeligibi
title: "A10/B6 关闭——共用 evaluateContractCloseEligibility() 的三道防线"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# A10/B6 关闭——共用 evaluateContractCloseEligibility() 的三道防线

| 防线 | 方法／端点 | 触发时机 | 是否使用 excludeMovementId？ | 是否预取批量数据？ |
|---|---|---|---|---|
| 第一道——选取器提示 | listCloseEligibleContracts() | 第一步选取器加载时（仅供参考） | 否 | 是——为整页候选合约批量执行一组查询 |
| 第二道——Maker 提交 | createMovement() 中的 closeShaped 检查 | 提交时 | 否（该 movement 尚未写入） | 否 |
| 第三道——Checker 放行 | release() | 放行时，翻转状态／updateStatus() 之前 | 是——即该 CLOSE movement 自身的 id，此刻仍处于 PENDING | 否 |

## 来源证据

- `balanceService.ts:413-516 (layer 1)`
- `balanceService.ts:200-230 (layer 2)`
- `balanceService.ts:1160-1182 (layer 3)`

## 相关知识

- Maker/Checker Service Orchestration (balanceService.ts)
- [[Business-Rule-Index]]
