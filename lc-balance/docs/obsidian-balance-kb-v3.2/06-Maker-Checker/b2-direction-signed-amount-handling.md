---
knowledge_id: b2-direction-signed-amount-handling
title: "B2 Direction / 带符号 Amount 处理"
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

# B2 Direction / 带符号 Amount 处理

B2（Export LC Amendment）并没有各自独立的 AMEND_INCREASE/AMEND_DECREASE movementType——它的 movementType 始终只有一个 'AMEND'，Direction 改为通过一个 subChoice.key:'amendDirection' 的选择来携带。model.amount 被刻意设计为永远不会被修改（始终保持 Maker 键入的正值，因为它会被重新渲染回实时的 Formly 表单）；带符号的电文金额（Decrease 为负值）只在 buildSubmitRequest() 内部、根据 ctx.amendDirection 计算得出，且仅用于外发请求。

## Source Evidence

- `src/app/transaction-builder/submit-rules.spec.ts lines 608-650`
- `src/app/transaction-builder/submit-rules.ts lines 149-156, 168-176`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
