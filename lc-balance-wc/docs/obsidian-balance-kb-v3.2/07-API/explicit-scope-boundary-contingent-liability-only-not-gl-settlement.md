---
knowledge_id: explicit-scope-boundary-contingent-liability-only-not-gl-settlement
title: "明确的范围边界——仅限或有负债，不涉及 GL/清算"
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

# 明确的范围边界——仅限或有负债，不涉及 GL/清算

（本笔记为「范围之外」声明式笔记，已按统一规则精简；完整的范围判断说明见 [[Balance Component Overview#範疇之外|Balance Component Overview 的「范围之外」小节]]，此处不再重复展开。）

本微服务的 OAS 明确列出自身的范围之外（Out of Scope）清单：IBL/EBL 及任何实际已放款/贴现的风险敞口（属于 Loan Component 的职责范围）、利息/应计计算（同样属于 Loan Component），以及 GL 科目对应（本服务仅将调用方提供的 accountEntries 原样传递给下游会计组件，不做任何解读）。EPLC_DUE_FROM_ISSUING_BANK 被刻意设计为纯应收款，在本合约体系中没有配对的负债项，也没有清算端点——这是永久性的范围边界，而非功能缺口。

## Source Evidence

- `balance-component-api.yaml lines 148-152 (v0.8.0 scope correction note)`
- `balance-component-api.yaml lines 20-25 (top-level OUT OF SCOPE)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
