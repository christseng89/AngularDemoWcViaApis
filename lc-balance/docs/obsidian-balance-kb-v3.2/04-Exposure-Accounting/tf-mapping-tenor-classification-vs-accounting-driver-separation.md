---
knowledge_id: tf-mapping-tenor-classification-vs-accounting-driver-separation
title: "TF 对照 — 期限分类与会计驱动因素的分离"
domain: Balance
category: Domain Concept
status: INFERRED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 本次分析快照中无 .git 历史记录，参见 [[Source-to-Knowledge-Map|来源知识对照表]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# TF 对照 — 期限分类与会计驱动因素的分离

在工作簿的设计中，tenorType（SIGHT/BUYERS_USANCE/SELLERS_USANCE）纯粹是为了产品设定、UI 呈现与 MIS 而保留的字段——明确规定绝不可被会计、风险或监管逻辑读取（这是一项构建阶段即会中断的静态检查，V1）。真正的会计驱动因素，是由 undertakingAvailability、financingStructure、fundingParty、availableWith 四者组合派生而来，每一项都需要经办人确认并留痕（derivation_rule_version、operator_confirmed_by/_at、overridden/override_reason）。这一设计在概念上与实际代码库中的 domain/tenorRouting.ts（CLAUDE.md 中已引用）相呼应，但本次萃取过程中并未针对该源文件进行独立交叉核对。

## Source Evidence

- `TF_Balance_Component_Mapping-en.txt lines 538-554 (=== SHEET: Tenor_Derivation ===)`

## Related Knowledge

- [[Business-Rule-Index|业务规则索引]]
- [[Balance Component Overview|余额组件概览]]
