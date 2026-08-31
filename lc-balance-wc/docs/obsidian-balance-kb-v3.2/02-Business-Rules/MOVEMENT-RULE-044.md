---
knowledge_id: MOVEMENT-RULE-044
title: "Acceptance/DPU 一经承兑即不可撤销，永远不能被修改类事件减少（设计文档规则）"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - movement
  - confirmed
---

# MOVEMENT-RULE-044 — Acceptance/DPU 一经承兑即不可撤销，永远不能被修改类事件减少（设计文档规则）

## Status
CONFIRMED

## Business Rule
按照源设计文档，一笔已承兑的汇票或已产生的 DPU 是一项现时的、无条件的义务，不能通过修改来增加或减少。任何看似的变动都必须是以下三种彼此独立、各自拥有不同证据/控制点的事件之一：ACC_CORRECTION、ACC_REDUCTION_CONSENTED 或 ACC_NEW。这是一条源自设计文档的规则；需要说明的是，它描述的是『预期中的架构』——Balance Component 当前实际的 A6/A7 实现并未将 ACC_CORRECTION/ACC_REDUCTION_CONSENTED/ACC_NEW 建模为独立的事件类型（在实际的 movementType 表中，IPLC_ACCEPTANCE/EPLC_ACCEPTANCE 只存在 CREATE/PARTIAL_SETTLE/FULL_SETTLE），因此这条规则属于设想层面/设计文档层面，并非对实际运行行为的描述。

## Conditions
一笔 Acceptance/DPU 类型的动账处于 ACTIVE/OUTSTANDING 状态

## Result
按设计文档：任何针对 Acceptance/DPU 的 *_AMD_* 风格事件都应被直接拒绝；而实际运行的系统中根本不存在这样的事件类型可供尝试

## Example
设计文档自身的校验点 I8

## Verification Note
在此下调的是强调程度而非状态本身，旨在标明这仅来自设计文档——依据 CLAUDE.md 自身的说明，这两份 .docx 属于『未落地的设计文档』引用，其 §N 引用编号与实际源码注释并不对应；由于 MOVEMENT_DIRECTION 中本就不存在针对 Acceptance 的 *_AMD_* 类型，这条规则在实际代码中是『空洞成立/因构造而成立』的——即不是因为存在一个主动的校验拦截，而是因为根本不存在可供拒绝的修改路径。之所以维持 CONFIRMED，是因为文档内容本身已被逐字验证，且其实际结论（不存在 Acceptance 修改路径）也独立为真。

## Source Evidence

Implementation:
- `TF_Contingent_Liability_Lifecycle-en.txt §5.1`
- `TF_Balance_Component_Spec-en.txt I8`

Tests:
- `TF_Balance_Component_Spec-en.txt §12 T7`

## Related Knowledge
- [[BalanceMovement]]
- Acceptance/DPU is irrevocable — 'Acceptance Amendment' is not a valid business event
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
