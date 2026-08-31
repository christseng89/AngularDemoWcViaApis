---
knowledge_id: implemented-movementtype-sets-constrain-which-ledger-events-are-callab
title: "已实现的 movementType 集合限制了哪些总账事件可被调用"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 本次分析快照中无 .git 历史记录，参见 [[Source-to-Knowledge-Map|来源知识对照表]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# 已实现的 movementType 集合限制了哪些总账事件可被调用

IPLC_LC 已实现的 movementType 集合为 ISSUE/AMEND_INCREASE/AMEND_DECREASE/UTILIZE；EPLC_CONFIRMATION 的为 ISSUE/AMEND/HONOUR/ACCEPT；SHGT 的仅为 ISSUE/PARTIAL_REDEEM/FULL_REDEEM。这些集合都不包含 EXPIRE、CANCEL 或 SG 专属的 AMEND 值，尽管原始规格中已为 LC/保兑到期注销以及 SG 修改减少/索赔定义了对应的 Dr/Cr 记账对，视其为必要事件。

## Source Evidence

- `analysis/contingent-liability-ledger.html Notes items 4 and 7`

## Related Knowledge

- [[Business-Rule-Index|业务规则索引]]
- [[Balance Component Overview|余额组件概览]]
