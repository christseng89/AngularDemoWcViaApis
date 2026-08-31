---
knowledge_id: transactionbuildercomponent-orchestration-shell
title: "TransactionBuilderComponent（编排外壳）"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# TransactionBuilderComponent（编排外壳）

这个曾经长达 2,923 行的 God Component，如今只剩 436 行，只做真正的一件事：模式（PROCESSING/INQUIRE）与功能/side 的选择、把 Maker/Checker 面板与各项服务串接起来、Account Entries 对话框的开关状态、以及 Checker 动作分派（release/reject/acknowledgeArrival/deleteMakerPending）。它持有 MakerPanelComponent 状态的一份只读镜像（`makerContext`），用于构建 `CheckerActionContext`，并缓存 Maker 最后一次已知的 LC/instrumentType（`lastMakerSync`），以便在复合 Release 重置 Maker 画面之后，Look Up Current Balance 仍能正常刷新。

## Source Evidence

- `transaction-builder.component.ts:1-488`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
