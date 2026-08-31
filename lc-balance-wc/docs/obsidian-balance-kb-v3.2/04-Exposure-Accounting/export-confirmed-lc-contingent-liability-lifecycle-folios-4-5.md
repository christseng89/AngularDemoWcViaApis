---
knowledge_id: export-confirmed-lc-contingent-liability-lifecycle-folios-4-5
title: "出口保兑信用证或有负债生命周期（Folio 4–5）"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# 出口保兑信用证或有负债生命周期（Folio 4–5）

根据 analysis/contingent-liability-ledger.html Folio 4–5 的记载，本图展示出口保兑信用证（Export Confirmed LC）或有负债 Dr/Cr 记账的完整流程：从建立（B1／B2-增加）、单据提示备忘步骤（B3），经 Honour/Accept 解除（B4），到仅适用于 Usance 期限的承兑影子分支（B5）。

```mermaid
flowchart TD
  B1["B1 · ISSUE\n建立 Folio 4 记账对"] --> CACTIVE("保兑 ACTIVE 状态\nSight 或 Usance — 期限类型由三分类简化而来")
  CACTIVE -->|修改增加| B2I["B2 · AMEND (+delta)\n建立"]
  B2I --> CACTIVE
  CACTIVE -->|修改减少| B2D["B2 · AMEND (−delta)\n解除"]
  B2D --> CACTIVE
  CACTIVE -->|单据提示| B3["B3 · CREATE (EPLC_EXAMINATION)\n不产生总账效果（备忘，MEMO_ONLY）\nPENDING 圈存"]
  B3 -->|Sight 期限| B4H["B4 复核人解除 · HONOUR\n解除 Folio 4 记账对"]
  B4H --> RELEASED_S("保兑记账对已解除 — Sight\n（结转为表内 Due from Issuing Bank 资产，不在本范畴内）")
  B3 -->|Usance 期限，原规格 Case1/Case2 未区分| B4A["B4 复核人解除 · ACCEPT\n解除 Folio 4 记账对，并\n建立 Folio 5 承兑影子记账\n（一次复合解除动作）"]
  B4A --> RELEASED_U("保兑记账对已解除 — Usance ＋\n承兑影子记账已建立")
  RELEASED_U --> B5["B5 · FULL_SETTLE/PARTIAL_SETTLE\n（持有至到期或已贴现 — 记账方式相同）\n解除 Folio 5 影子备忘记账"]
  B5 --> DONE("承兑影子记账已解除")
  CACTIVE -.->|到期失效 — 尚未实现，无 EXPIRE movementType| EXPIRE["应有的余额冲销处理\n（规格中已记录，但尚未实现）"]
```

## Source Evidence

- `analysis/contingent-liability-ledger.html #folio-4, #folio-5, #coverage, Notes items 2,10,11,12,13`

## Related Knowledge

- 或有负债分类账（Dr/Cr 参考）
- [[Business-Rule-Index|业务规则索引]]
