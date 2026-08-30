---
knowledge_id: instrumenttype-enum
title: "InstrumentType 枚举"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# InstrumentType 枚举

| Value | Meaning（含义） | Scope note（范围说明） |
|---|---|---|
| IPLC_LC | 进口 LC | 已实现 |
| EPLC_LC | 出口 LC | 目前不存在实际的创建路径——预留供未来扩展 |
| IPLC_ACCEPTANCE | 进口承兑/DPU | 已实现 |
| EPLC_ACCEPTANCE | 出口承兑/DPU | 已实现 |
| SHGT | 提货担保 | 仅作为 IPLC_LC 的子账本 |
| EPLC_CONFIRMATION | 出口保兑 LC | 已实现 |
| EPLC_EXAMINATION | 交单（B3） | MEMO_ONLY，仅 CREATE，从不过账 accountEntries，也不影响 EPLC_CONFIRMATION 自身的余额 |
| EPLC_DUE_FROM_ISSUING_BANK | Confirmation 于即期兑付或买方远期后形成的表内资产 | ON_BALANCE_ASSET |
| EPLC_ACCEPTANCE_REIMB_RECEIVABLE | Confirmation 于 Accept 后形成的表内资产 | ON_BALANCE_ASSET |
| EPLC_EXPORT_BILLS_DISCOUNTED | Discount 后由 EPLC_ACCEPTANCE_REIMB_RECEIVABLE 重分类而来 | ON_BALANCE_ASSET |

## Source Evidence

- `Balance-Component-DB-Design.txt §5.1 (lines 484-514)`

## Related Knowledge

- DB Design + DB Optimization Analysis Docs
- [[Business-Rule-Index]]
