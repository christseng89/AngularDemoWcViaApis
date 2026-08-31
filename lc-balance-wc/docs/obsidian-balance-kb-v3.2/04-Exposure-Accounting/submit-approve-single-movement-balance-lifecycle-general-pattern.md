---
knowledge_id: submit-approve-single-movement-balance-lifecycle-general-pattern
title: "提交 → 核准 — 单笔动作余额生命周期（通用模式）"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# 提交 → 核准 — 单笔动作余额生命周期（通用模式）

这是每一张 A1–A10/B1–B6 各功能表格，针对单一非复合动作所共同遵循的主时序模式，展示了增量型与减量型动作之间的不对称性（增加从严，占用从宽）。

```mermaid
flowchart TD
  A[Maker 建立动作，状态为 PENDING] --> B{动作形态？}
  B -->|增量型：ISSUE / AMEND_INCREASE / B1 / B2-增加| C[提交时：可用余额 += ceilingAmount<br/>已确认余额不变<br/>紧缩可用余额不变——在核准前不可见]
  B -->|减量型：AMEND_DECREASE / UTILIZE / B2-减少 / CLOSE| D[提交时：可用余额 -= ceilingAmount<br/>已确认余额不变<br/>紧缩可用余额 -= ceilingAmount（经由待处理减少合计）]
  C --> E[Checker 解除，状态为 RELEASED]
  D --> E
  E --> F{动作形态？}
  F -->|增量型| G[核准时：已确认余额 += ceilingAmount<br/>可用余额不变——已提前反映<br/>紧缩可用余额 += ceilingAmount]
  F -->|减量型| H[核准时：已确认余额 -= ceilingAmount<br/>可用余额不变——已提前反映<br/>紧缩可用余额不变——已提前反映]
  G --> I[待处理圈存合计归零]
  H --> I
```

## Source Evidence

- `Balance-Figures-Calculation-Logic.txt lines 348-397 (§5 General Pattern)`

## Related Knowledge

- 余额数字计算逻辑与 TF 余额组件对照工作簿
- [[Business-Rule-Index|业务规则索引]]
