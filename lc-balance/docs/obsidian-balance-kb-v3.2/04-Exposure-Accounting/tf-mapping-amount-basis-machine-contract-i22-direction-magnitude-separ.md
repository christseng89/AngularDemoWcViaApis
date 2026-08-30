---
knowledge_id: tf-mapping-amount-basis-machine-contract-i22-direction-magnitude-separ
title: "TF 对照 — 金额基础的机器可执行契约（I22 方向/量值分离）"
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

# TF 对照 — 金额基础的机器可执行契约（I22 方向/量值分离）

每一条 L2 余额动作记录都携带一个 amount_basis_code，其职责仅限于解析量值（MAGNITUDE），是（事件、承诺项、配置、事件发生时点余额）的纯函数；与之配对的 'movement' 栏位（INCREASE/DECREASE/DERIVED_FROM_SIGN/MIRRORED）则独立负责方向（DIRECTION）。NON_NEGATIVE 符号契约代码必须搭配静态的 INCREASE/DECREASE；SIGNED 代码（例如 AMENDMENT_DELTA 实际上依 I22 规范属于 NON_NEGATIVE、仅量值——ECL_DELTA 与 FX_REVAL_DELTA 才是真正的 SIGNED 范例）必须搭配 DERIVED_FROM_SIGN。代码与 L2 对照表一同版本化——变更某一解析器的语义，必须新增代码，绝不可就地修改。

## Source Evidence

- `TF_Balance_Component_Mapping-en.txt line 608 (I22 invariant text)`
- `TF_Balance_Component_Mapping-en.txt lines 414-449 (=== SHEET: Amount_Basis ===)`

## Related Knowledge

- [[Business-Rule-Index|业务规则索引]]
- [[Balance Component Overview|余额组件概览]]
