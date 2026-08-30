---
knowledge_id: tf-mapping-invariants-i1a-through-i22-correctness-contract
title: "TF 对照 — 不变量 I1A 至 I22（正确性契约）"
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

# TF 对照 — 不变量 I1A 至 I22（正确性契约）

22 条具名不变量（I1A/I1B/I1C 加上 I2–I22）共同构成工作簿自身的「正确性契约」——这些是硬编码、不可透过配置调整的引擎行为，在交易/记账边界或构建阶段强制执行，涵盖：分录借贷平衡（同一 posting_transaction_id 下 Dr=Cr）、或有负债备忘配对的对称性、禁止负数或有负债、幂等性（相同键值＋相同报文可重放，相同键值＋不同报文则一律硬拒绝）、乐观并发控制、框架不可变性（任何配置都不得重新指定某一事件应产生哪些余额）、表示层净额呈现的准入条件（须通过 IAS 32.42 检验，绝不能仅凭配置决定）、币种精度的四舍五入顺序，以及方向/量值分离（movement 负责方向，amount_basis_code 负责量值）。每一条不变量都附有一个源自真实生产环境 TF 系统缺陷的既有失败案例。

## Source Evidence

- `TF_Balance_Component_Mapping-en.txt lines 581-608 (=== SHEET: Invariants ===, I1A–I22)`

## Related Knowledge

- [[Business-Rule-Index|业务规则索引]]
- [[Balance Component Overview|余额组件概览]]
