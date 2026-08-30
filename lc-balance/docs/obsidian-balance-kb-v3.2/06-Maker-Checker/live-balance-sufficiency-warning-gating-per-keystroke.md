---
knowledge_id: live-balance-sufficiency-warning-gating-per-keystroke
title: "实时余额充足性预警门控（逐按键触发）"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# 实时余额充足性预警门控（逐按键触发）

Maker 面板在 Amount 每次按键输入时，如何判定应渲染普通的"超出可用余额（Available Balance）"预警、"超出从紧可用余额（Tight Available Balance）"预警，还是两者都不显示——包含 B3/A8 仅检查 Tight 类型的例外情形。

```mermaid
flowchart TD
  S["Maker 输入 Amount"] --> Q1{"checksAgainstTightAvailable？"}
  Q1 -->|false| N1["不渲染任何预警"]
  Q1 -->|true| Q2{"checksAgainstPlainAvailable？（UTILIZE/HONOUR/ACCEPT/Amend-Decrease）"}
  Q2 -->|true| Q3{"Amount 是否 <= 可用余额（plain Available Balance）？"}
  Q3 -->|否| W1["显示第一级预警：'超出可用余额（Available Balance）'"]
  Q3 -->|是| Q4{"Amount 是否 <= tightAvailableBalanceForWarning？"}
  Q2 -->|false，B3/A8 仅检查 Tight 类型| Q4
  Q4 -->|是| N2["不渲染任何预警"]
  Q4 -->|否| W2["显示第二级预警：'超出从紧可用余额（Tight Available Balance）'"]
```

## Source Evidence

- `maker-panel.component.ts:358-405, 774-808`

## Related Knowledge

- Angular Maker 面板与提交编排（Submit Orchestration）
- [[Business-Rule-Index]]
