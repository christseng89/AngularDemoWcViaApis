---
knowledge_id: movement-direction-table
title: "MOVEMENT_DIRECTION 对照表"
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

# MOVEMENT_DIRECTION 对照表

每一笔动作对已确认余额/可用余额的贡献，都是其 ceilingAmount 乘以一个固定的 +1 或 −1，该符号依每个合约系列的 movementType 而定。增加类（ISSUE、AMEND_INCREASE、CREATE）为 +1；减少类（AMEND_DECREASE、UTILIZE、PARTIAL/FULL_SETTLE、PARTIAL/FULL_REDEEM、HONOUR/ACCEPT、REIMBURSE/RECLASSIFY_OUT、CLOSE）为 −1。EPLC_CONFIRMATION 自身的 AMEND 是唯一的例外——其方向取决于所提交金额的正负号，而非固定的表格项。EPLC_EXAMINATION 的 CREATE 从不计入已确认余额/可用余额（MEMO_ONLY，D3）。

## Source Evidence

- `Balance-Figures-Calculation-Logic.txt lines 265-311 (§3 Movement Direction Table)`

## Related Knowledge

- [[Business-Rule-Index|业务规则索引]]
- [[Balance Component Overview|余额组件概览]]
