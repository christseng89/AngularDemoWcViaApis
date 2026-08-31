---
knowledge_id: balance-tab-visibility-gating-lc-acceptance-sg
title: "余额分页签显示门禁（LC／承兑／装船保函）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 余额分页签显示门禁（LC／承兑／装船保函）

| 买卖方向 | InstrumentType | TenorType | LC/保兑 LC 页签 | 承兑页签 | 装船保函页签 | 页签总数 |
|---|---|---|---|---|---|---|
| 进口 | IPLC_LC | SIGHT（即期） | 有 | 无 | 有 | 2 |
| 进口 | IPLC_LC | 远期（BUYERS_USANCE/SELLERS_USANCE/DP/DA） | 有 | 有 | 有 | 3 |
| 出口 | EPLC_CONFIRMATION | SIGHT（即期） | 有 | 无 | 无（出口方向没有装船保函 SHGT） | 1 |
| 出口 | EPLC_CONFIRMATION | 远期 | 有 | 有 | 无 | 2 |
| 进口／出口 | 任意 | null／未设置 | 有 | 无（视同「非远期」） | 按 instrumentType 规则判定 | 1 或 2 |

## 来源证据

- `inquire-events.service.ts:276-286`
- `look-up-panel.service.ts:136-145`
- `inquire-events.service.spec.ts:732-772`

## 相关知识

- Inquire Events + Look Up Current Balance (read-model)
- [[Business-Rule-Index]]
