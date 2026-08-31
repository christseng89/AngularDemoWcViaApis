---
knowledge_id: tf-mapping-balance-taxonomy-six-balance-classes
title: "TF 对照 — 余额分类体系（六大余额类别）"
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

# TF 对照 — 余额分类体系（六大余额类别）

工作簿将每一个 balance_type 归入六种 balance_class 之一：CONTINGENT（表外承诺项，例如 LC_OUTSTANDING/SG_OUTSTANDING/CONFIRMATION_OUTSTANDING，恒为 FIXED 表示方式）、ON_BALANCE_ASSET／ON_BALANCE_ASSET_CONTRA／ON_BALANCE_LIABILITY（真正入总账的表内余额，部分依 IAS 32.42 属于 NET_IF_ELIGIBLE）、PROFIT_AND_LOSS，以及 MEMO_ONLY（永不进入财务报表的影子/追踪余额，例如 ACCEPTANCE_SHADOW_DR/CR、DOCUMENT_UNDER_EXAMINATION）。natural_side（Dr/Cr）驱动出一个派生的 posting_side，而非直接以字面值存储，因为 memo_pair_direction 是可依机构而设定的；presentation_rule 则是另一个独立的、仅涉及报表呈现层面的概念。

## Source Evidence

- `TF_Balance_Component_Mapping-en.txt lines 76-130 (=== SHEET: Balance_Taxonomy ===)`

## Related Knowledge

- [[Business-Rule-Index|业务规则索引]]
- [[Balance Component Overview|余额组件概览]]
