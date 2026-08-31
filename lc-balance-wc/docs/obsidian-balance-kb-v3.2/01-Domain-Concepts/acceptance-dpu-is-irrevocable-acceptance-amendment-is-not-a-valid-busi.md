---
knowledge_id: acceptance-dpu-is-irrevocable-acceptance-amendment-is-not-a-valid-busi
title: "Acceptance/DPU is irrevocable — 'Acceptance Amendment' is not a valid business event"
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

# Acceptance/DPU is irrevocable — 'Acceptance Amendment' is not a valid business event

已被承兑的汇票或已发生的 DPU（延期付款承诺），是一项当下即成立、且无条件的义务。银行不能增加它（那将构成针对一份新提示单据的新承兑），也不能减少它（那将构成对一项硬性负债的否认）。任何看似「修改」的需求，实际上都必须拆分为三个具备不同控制机制与证据要求、彼此截然不同的事件：ACC_CORRECTION（一笔有签核的入账错误冲正+重新入账，maker≠checker，附原因代码，并链接回原始 event_id）、ACC_REDUCTION_CONSENTED（须有书面持票人同意证明，且流通票据须实体交还）、以及 ACC_NEW（同一信用证项下针对另一份提示单据的新承兑——是一个全新的承诺对象/id）。若将这三者都建模为一种通用的「修改 ±」，将使操作员得以在毫无证据轨迹的情况下冲减一项硬性负债——这将构成审计发现问题。这正是实际系统中「承兑类异动永远不存在 AMEND_DECREASE 对应项」这一不变量的领域论证依据，也是 I8 所述「仅能透过 ACC_MATURE / ACC_FORCED / ACC_DISCOUNT / ACC_REDUCTION_CONSENTED 减少余额——绝不透过修改类事件」的基础。

## Source Evidence

- `TF_Balance_Component_Spec-en.txt I8; state machine note: 'No AMENDED state exists. Reject any *_AMD_* event against this machine.'`
- `TF_Contingent_Liability_Lifecycle-en.txt §5.1: three-row table (ACC_CORRECTION/ACC_REDUCTION_CONSENTED/ACC_NEW)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
