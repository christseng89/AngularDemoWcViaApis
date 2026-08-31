---
knowledge_id: payable-movement-step-2-eligibility-a4-a6-vs-b4
title: "Payable Movement（第二步）资格判定——A4/A6 对比 B4"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# Payable Movement（第二步）资格判定——A4/A6 对比 B4

| 功能 | 合约范围 | movementType 过滤条件 | status 过滤条件 | 额外限制条件 |
|---|---|---|---|---|
| A4（平铺 Catalog，同一合约） | 与所选 LC 相同的合约 | UTILIZE（或 selectedFunction.payableMovementType 覆写值） | PENDING | 仅 UTILIZE：acknowledgedAt 已设置 且 makerSubmittedAt 未设置 |
| A6（Parent LC 选择器，同一合约） | 与所选 Parent LC 相同的合约 | UTILIZE（或覆写值） | PENDING | 与 A4 相同（makerSubmittedAt 排除条件对 A6 无效，因为 A6 从不设置该字段） |
| B4（平铺 Catalog，跨合约） | 同一 LC Number 下、selectedFunction.payableMovementInstrumentType 所指的子合约 | selectedFunction.payableMovementType（默认为 'UTILIZE'） | 若 checkerRelease.sourceAlreadyReleasedBeforePick 为真则为 RELEASED，否则为 PENDING | presentDocsConsumedAt 必须为 null |

## Source Evidence

- `picker-selection.service.ts:291-410`

## Related Knowledge

- Angular Pickers, Eligibility Hints, Orchestrating Shell
- [[Business-Rule-Index]]
