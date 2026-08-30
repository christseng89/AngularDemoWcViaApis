---
knowledge_id: assertvalidamount-allowed-sign-per-movementtype
title: "assertValidAmount()——按 movementType 划分的允许符号"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# assertValidAmount()——按 movementType 划分的允许符号

| movementType | 金额为零 | 金额为负 | 金额为正 |
|---|---|---|---|
| AMEND（B2） | 拒绝 | 接受（减少方向） | 接受（增加方向） |
| CLOSE（A10/B6） | 接受（全额使用后的核销） | 拒绝 | 接受 |
| 其余所有 movementType | 拒绝 | 拒绝 | 接受 |

## 来源证据

- `balanceService.ts:952-982`
- `amountValidation.test.ts:30-212`

## 相关知识

- Maker/Checker Service Orchestration (balanceService.ts)
- [[Business-Rule-Index]]
