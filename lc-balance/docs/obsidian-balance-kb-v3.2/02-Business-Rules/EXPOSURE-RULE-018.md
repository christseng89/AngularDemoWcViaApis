---
knowledge_id: EXPOSURE-RULE-018
title: "范畴边界——Balance Component 仅覆盖或有/表外敞口；所有表内分录明确不在范畴内"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 分析快照中没有 .git 历史记录，参见 [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - exposure
  - confirmed
---

# EXPOSURE-RULE-018 — 范畴边界——Balance Component 仅覆盖或有/表外敞口；所有表内分录明确不在范畴内

> 完整的范畴判断说明见 [[Balance Component Overview#范畴之外]] 的「范畴之外」小节，此处不重复展开。

## 技术重点
Balance Component 的或有负债总账仅覆盖 LC、SG、Confirmation 敞口的备忘（表外）Dr/Cr 配对，以及 Acceptance/DPU 影子备忘。任何表内分录（已放款应收、真实的 Acceptance/DPU 负债、保证金、手续费、ECL、结算、往来账户）均不在范畴内，本总账从不过账或显示这些内容，即便原始规格文件将其记入同一笔交易也是如此。

## 原始码证据

- `analysis/contingent-liability-ledger.html .scope-box`

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- CLAUDE.md 自身在仓库层级的范畴边界声明：「Balance Component 只负责 Contingent Liability」
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
