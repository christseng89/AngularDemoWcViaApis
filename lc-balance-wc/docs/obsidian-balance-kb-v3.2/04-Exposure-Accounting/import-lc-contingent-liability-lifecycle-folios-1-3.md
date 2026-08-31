---
knowledge_id: import-lc-contingent-liability-lifecycle-folios-1-3
title: "进口信用证或有负债生命周期（Folio 1–3）"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# 进口信用证或有负债生命周期（Folio 1–3）

根据 analysis/contingent-liability-ledger.html Folio 1–3 与功能代码覆盖索引所记载，本图展示进口信用证（Import LC）或有负债 Dr/Cr 记账的完整流程：从建立（A1/A2-增加）、解除（A2-减少/A4/A6/A7），到 SG 分支（A8/A9/A3S）。虚线路径标示不产生总账效果（仅备忘）或尚未实现的事件。

```mermaid
flowchart TD
  A1["A1 · ISSUE\n建立 Folio 1 记账对"] --> ACTIVE("LC ACTIVE 状态\n已建立或有负债对，依期限类型分列")
  ACTIVE -->|修改增加| A2I["A2 · AMEND_INCREASE\n建立 +delta"]
  A2I --> ACTIVE
  ACTIVE -->|修改减少，无需同意闸门| A2D["A2 · AMEND_DECREASE\n解除 −delta"]
  A2D --> ACTIVE
  ACTIVE -->|针对本 LC 签发 SG| A8["A8 · ISSUE\n建立 Folio 2 SG 记账对"]
  A8 --> SGACTIVE("SG ACTIVE 状态\n不依期限类型后缀区分")
  SGACTIVE -->|赎回，取 Bill 金额与 SG 未偿余额中的较小值| A9["A9 · FULL_REDEEM/PARTIAL_REDEEM\n解除 Folio 2\n参见 CONFLICT：后续 UI 已锁定为仅允许全额赎回"]
  A9 --> SGACTIVE
  ACTIVE -->|单据到达| A3["A3/A3S · Utilize 前置步骤\n不产生总账效果（备忘）\n建立 PENDING 的 UTILIZE 圈存"]
  A3 -.->|仅 A3S，关联分支| A9
  A3 -->|Sight 期限| A4["A4 复核人解除 · UTILIZE\n解除 Folio 1 记账对 — Sight"]
  A4 --> RELEASED_S("LC 记账对已解除 — Sight")
  A3 -->|买方/卖方远期| A6["A6 复核人解除 · UTILIZE + CREATE\n解除 Folio 1 记账对，并\n建立 Folio 3 承兑影子记账\n（一次复合解除动作）"]
  A6 --> RELEASED_U("LC 记账对已解除 — Usance ＋\n承兑影子记账已建立")
  RELEASED_U --> A7["A7 · FULL_SETTLE/PARTIAL_SETTLE\n解除 Folio 3 影子备忘记账"]
  A7 --> DONE("承兑影子记账已解除")
  ACTIVE -.->|到期/注销 — 尚未实现，无 EXPIRE/CANCEL movementType| EXPIRE["应有的余额冲销处理\n（规格中已记录，但尚未实现）"]
```

## Source Evidence

- `analysis/contingent-liability-ledger.html #folio-1, #folio-2, #folio-3, #coverage, Notes items 3,4,6,7,8,9`

## Related Knowledge

- 或有负债分类账（Dr/Cr 参考）
- [[Business-Rule-Index|业务规则索引]]
