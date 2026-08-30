---
knowledge_id: netting-eligibility-ias-32-42-resolution-presentation-rule-net-if-elig
title: "净额结算资格（IAS 32.42）判定——presentation_rule = NET_IF_ELIGIBLE"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 净额结算资格（IAS 32.42）判定——presentation_rule = NET_IF_ELIGIBLE

| 条件 | 要求 |
|---|---|
| 抵销权 | 在正常经营过程中，以及在所有各方发生违约、无力偿债与破产的情形下，均具有法律强制执行力 |
| 交易对手关系 | 同一交易对手，或符合资格的关系 |
| 结算意图 | NET 或 SIMULTANEOUS（不得为 NEITHER） |
| 治理 | 有会计政策签核证据，并附法律意见引用 |
| 判定结果 | 仅当以上条件在同一交易对手、同一报告日 **全部** 成立时，presentation 才为 NET；否则一律为 GROSS（默认值）——评估失败或缺失时绝不报错，也绝不默默按净额处理 |

## Source Evidence

- `TF_Balance_Component_Spec-en.txt §2.4.1, I19`

## Related Knowledge

- Foundational Design-Rationale Docs (TF Balance Spec + Contingent Liability Lifecycle)
- [[Business-Rule-Index]]
