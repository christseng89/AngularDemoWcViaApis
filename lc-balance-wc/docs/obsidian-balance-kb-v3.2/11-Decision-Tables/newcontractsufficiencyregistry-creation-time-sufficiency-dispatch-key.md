---
knowledge_id: newcontractsufficiencyregistry-creation-time-sufficiency-dispatch-key
title: "newContractSufficiencyRegistry ——创建时充足性检查的调度键"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# newContractSufficiencyRegistry ——创建时充足性检查的调度键

| 注册表键（instrumentType:movementType） | 检查函数 | 验证内容 |
|---|---|---|
| SHGT:ISSUE | checkNewShgtSufficiency() | 新 SG Issue 金额对比母 LC 的净额可用容量（Confirmed − PendingDecrease − 既有 SG 敞口） |
| EPLC_EXAMINATION:CREATE | checkNewPresentDocsSufficiency() | 新 B3 交单金额对比母 Confirmation 的净额可用容量（Confirmed − PendingDecrease − Σ 其他 PENDING 交单），要求严格，不享有临时性占用抵扣的优待 |

## Source Evidence

- `balanceService.ts:324-329`
- `balanceService.ts:331-396`

## Related Knowledge

- Maker/Checker Service Orchestration (balanceService.ts)
- [[Business-Rule-Index]]
