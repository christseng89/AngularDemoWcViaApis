---
knowledge_id: off-balance-sheet-exposure-present-docs-earmark-import-export-analogs
title: "表外风险敞口与 Present Docs Earmark（进口/出口侧的对应关系）"
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

# 表外风险敞口与 Present Docs Earmark（进口/出口侧的对应关系）

offBalanceExposure（仅限 IPLC_LC/EPLC_LC）等于 PENDING+RELEASED 状态的 SHGT ISSUE 之和，扣除以该 LC 为父合约、已真正 RELEASED 的 SHGT 赎回金额——这是 Shipping Guarantee 在进口侧占用的额度。presentDocsEarmarkPending/presentDocsEarmarkApproved（仅限 EPLC_CONFIRMATION）是出口侧的对应概念：分别是仍处于 PENDING 状态、以及已 RELEASED 但尚未被 B4 消费的 EPLC_EXAMINATION CREATE 金额之和。两者都会计入 tightAvailableBalance，作为各自一侧「已预留但尚未最终确定」的扣减项。

## Source Evidence

- `balance-component-api.yaml lines 1650-1732 (offBalanceExposure/presentDocsEarmarkPending/presentDocsEarmarkApproved schema descriptions)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
