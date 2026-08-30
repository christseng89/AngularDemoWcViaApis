---
knowledge_id: matched-businesseventid-exception-a3s-document-arrival-w-shipping-gtee
title: "匹配 businessEventId 的例外情形（A3S「随担保提货之单据到达」）"
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

# 匹配 businessEventId 的例外情形（A3S「随担保提货之单据到达」）

严格的"仅 RELEASED 才纳入净额计算"赎回净额规则，存在一个刻意设计的例外：当单据到达被明确匹配到某笔特定的未偿 SG（即 A3S 情形）时，调用方会先建立该 SG 自身的赎回动作（仍为 PENDING），再于同一笔逻辑交易中提交该 LC 的 UTILIZE，两者共享同一个 businessEventId。从 LC 额度的角度看，这一对动作构成单一的重分类事件（SG 风险敞口转为直接的 LC 动用），而非一次独立的额度占用增加——因此，只要一笔 PENDING 赎回的 businessEventId 出现在调用方提供的 matchedPendingUtilizeBusinessEventIds 集合中，就会立即纳入净额计算，效果等同于已 RELEASED。与之相对，一笔无关的独立赎回（没有匹配的 UTILIZE 兄弟动作）永远不享有此豁免，会持续被排除在 PENDING 计算之外，直到它自身也被 Release。

## Source Evidence

- `microservices/balance-component/src/domain/offBalanceExposure.ts:36-63`

## Related Knowledge

- [[Business-Rule-Index|业务规则索引]]
- [[Balance Component Overview|余额组件概览]]
