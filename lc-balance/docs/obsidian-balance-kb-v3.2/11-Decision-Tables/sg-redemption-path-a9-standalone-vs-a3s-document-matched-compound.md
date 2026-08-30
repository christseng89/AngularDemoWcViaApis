---
knowledge_id: sg-redemption-path-a9-standalone-vs-a3s-document-matched-compound
title: "SG Redemption 路径——A9（独立）对比 A3S（单据匹配的复合）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# SG Redemption 路径——A9（独立）对比 A3S（单据匹配的复合）

| 路径 | 金额来源（决策前） | 金额来源（决策后，经 BA 确认） | 产生的 movementType | 理由/例外依据 |
|---|---|---|---|---|
| A9——独立的 SG Redemption 画面 | 由 Maker 自由输入；根据输入金额与 Available 的比较自动判定为 FULL_REDEEM 或 PARTIAL_REDEEM | 锁定，自动从该 SG 自身的 Available Balance 带出（而非 Confirmed——必须扣除同一 SG 上任何已处于 PENDING 状态的赎回） | 硬编码固定为 FULL_REDEEM——金额不完全匹配即硬性拒绝，绝不会被默默降级处理 | SG 的解除是以单据为依据，而非以金额为依据（业界惯例：承运人仅凭正本 BL/AWB 缴回才解除保函责任）——此处不允许由 Maker 随意输入的部分赎回 |
| A3S——附带 Shipping Gtee 的单据到达（复合提交） | MIN(单据/汇票金额, SG 未偿金额)，自动判定为 FULL/PARTIAL_REDEEM，透过共享的 businessEventId 与配对的 IPLC_LC UTILIZE 绑定 | 维持不变——原样即为正确，BA 未要求改动 | 依 MIN() 推导结果为 FULL_REDEEM 或 PARTIAL_REDEEM | 真正意义上的单据匹配：部分金额绑定于一组具体、可辨识、可追溯的已到达单据（即配对的 UTILIZE），而非 Maker 随意输入的数字——这是经 BA 确认的规则明确开出的唯一一处狭义例外 |

## Source Evidence

- `Balance-Component-Business-Rule-Decisions-2026-08-21.md:10-38`

## Related Knowledge

- Quality/Remediation History Docs
- [[Business-Rule-Index]]
