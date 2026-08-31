---
knowledge_id: amount-field-lock-resolution-buildfields-priority-order-as-coded
title: "金额字段锁定判定（buildFields，按代码中的优先级顺序）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 金额字段锁定判定（buildFields，按代码中的优先级顺序）

| 优先级 | 标志 | 条件 | 是否可编辑？ | 标签样式 | 是否套用上限？ |
|---|---|---|---|---|---|
| 1 | amountFromDocArrival | settlesDocumentArrival && selectedPayMovement set (A6/B4) | 否——禁用 | "金额（承接自单据到达，受保护）" | 否 |
| 2 | amountFromFullSettle | amountVsAvailableDerivation !== 'SETTLE' && movementType === 'FULL_SETTLE' && snapshot resolved (A7) | 否——禁用 | "金额（全额结清——承接自承兑的可用余额，受保护）" | 否 |
| 3 | amountFromSgRedeem | amountVsAvailableDerivation === 'REDEEM' && snapshot resolved (A9) | 否——禁用 | "金额（仅限全额赎回——承接自装船保函的可用余额，受保护……）" | 否 |
| 4 | amountFromClose | amountAutoFilledFrom === 'confirmedBalance' && snapshot resolved (A10/B6) | 否——禁用 | "金额（关闭——承接自当前保兑余额，受保护；将其核销为 0）" | 否 |
| 5 | amountCappedAtAcceptance（不属于 amountLocked） | amountVsAvailableDerivation === 'SETTLE' && instrumentType === 'EPLC_ACCEPTANCE' && snapshot resolved (B5) | 是——可编辑 | "金额（默认为承兑的可用余额——如为部分结清可调低……）" | 是，= availableBalance |
| 6 | documentArrivalWithSg 标签覆写（A3S，未锁定） | compoundSubmission.possibleShapes includes 'documentArrivalWithSg' | 是——可编辑 | "汇票金额（实际单据金额——装船保函赎回金额见下方）" | 否 |
| 7 | 默认（以上条件均不匹配） | 未命中任何锁定条件 | 是——可编辑 | "金额（面额层级，参见设计文档 §6.2）" | 否 |

## 来源证据

- `builder-fields.ts:24-97`
- `builder-fields.spec.ts:66-184`

## 相关知识

- Angular Business Function Catalog (Strategy/Policy/Rules)
- [[Business-Rule-Index]]
