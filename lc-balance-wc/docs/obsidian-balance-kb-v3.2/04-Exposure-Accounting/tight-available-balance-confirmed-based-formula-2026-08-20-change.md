---
knowledge_id: tight-available-balance-confirmed-based-formula-2026-08-20-change
title: "紧缩可用余额 — 以已确认余额为基础的公式（2026-08-20 变更）"
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

# 紧缩可用余额 — 以已确认余额为基础的公式（2026-08-20 变更）

业务指示"只有 APPROVED 才可以动用"促成了一次公式变更：紧缩可用余额现在改为由已确认余额减去待处理减少合计、再减去表外风险敞口（对 EPLC_CONFIRMATION 而言，则改为合计的单据提示圈存）推导而得——不再像最初实现那样，直接以普通的可用余额为基础。仍为 PENDING 的增加，在真正被核准之前不再拉高紧缩可用余额；而仍为 PENDING 的减少，则仍会透过新增的「待处理减少合计」（图 #5a）立即压低紧缩可用余额——该数字只汇总同一合约上 PENDING 动作中带负号的贡献，且从不会与同一合约上的 PENDING 增加相互抵消。

## Source Evidence

- `Balance-Figures-Calculation-Logic.txt lines 189-207 (Figures #5a and #5)`
- `Balance-Figures-Calculation-Logic.txt lines 45-64 (banner: Formula change 2026-08-20)`

## Related Knowledge

- [[Business-Rule-Index|业务规则索引]]
- [[Balance Component Overview|余额组件概览]]
