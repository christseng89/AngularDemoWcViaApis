---
knowledge_id: balance-component-gl-posting-scope-mismatch
title: "Balance Component 总账过账范畴不一致"
domain: Balance
category: Domain Concept
status: CONFLICT
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# Balance Component 总账过账范畴不一致

TF_Balance_Component_Mapping workbook 描述了一套完整的总账过账／会计引擎（保证金收取、佣金递延/摊销、ECL 拨备、外汇重估、往来账结算、九项分录不变式 I1A–I21），但这些内容并未出现在 Balance Component 实际实现的范畴中。完整的范畴判断说明见 [[Balance Component Overview#範疇之外]] 的"範疇之外"小节，此处不重复展开。该 workbook 应被视为设计理据／目标态参考资料，而非对微服务当前实际行为的描述——此处仅记录为一项差距（gap），既不预设已解决、也不预设未解决。

## 来源证据

- `TF_Balance_Component_Mapping-en.txt lines 1-17 (README, 'Scope' row: Balance Component tracks contingent liability and its on-balance-sheet transformation, excludes financing/settlement)`
- `TF_Balance_Component_Mapping-en.txt lines 192-413 (L2_Balance_Movement sheet's own margin/commission/ECL/FX/nostro posting steps)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
