---
knowledge_id: sg-re-weighting-rationale-is-a-reasoned-internal-policy-position-not-a
title: "SG 权重调整的依据是经过论证的内部政策立场，而非 Basel/CRE20 规则（ccf_source）"
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

# SG 权重调整的依据是经过论证的内部政策立场，而非 Basel/CRE20 规则（ccf_source）

将 SG 视为 100% 直接信用替代品，并把相应信用证被 SG 覆盖部分的权重从正常贸易 CCF 20% 调整为 100%，两者均被明确标注为 INTERNAL_POLICY（内部政策）立场，而非 CRE20 监管规则——"CRE20 并未对此明确命名"。系统必须携带一个独立的 ccf_source 字段（REGULATORY 与 INTERNAL_POLICY 之分），以确保监管资本报送绝不会误读一笔仅出于银行自身合理政策选择而形成处理方式的余额（不变式 I10）。这正是 CLAUDE.md 中相应注记的领域理论依据：实际 Balance Component 中 `TenorType`/表外 SHGT-only 风险暴露处理是一项业务决策，而非普遍适用的监管规则——换言之，应将其理解为一种"可以自圆其说但需对外披露"的内部立场。

## 来源证据

- `TF_Balance_Component_Spec-en.txt preamble ccf_source paragraph and I10`
- `TF_Contingent_Liability_Lifecycle-en.txt §10.3: 'The shipping-guarantee 100% and the post-SG LC reclassification are internal-policy positions: reasoned, but not something you can point a supervisor at'`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
</content>
