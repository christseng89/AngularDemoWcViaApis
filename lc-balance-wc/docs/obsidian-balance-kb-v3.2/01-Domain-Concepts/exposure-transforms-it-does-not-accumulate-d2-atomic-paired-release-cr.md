---
knowledge_id: exposure-transforms-it-does-not-accumulate-d2-atomic-paired-release-cr
title: "风险暴露是转化，不是累加（D2）——原子性的成对解除/创建"
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

# 风险暴露是转化，不是累加（D2）——原子性的成对解除/创建

每一次从一种承诺形式转化为另一种（例如信用证或有负债→承兑负债、信用证或有负债→进口押汇应收款），都必须在同一个原子工作单元内，将"源承诺解除"与"目标承诺创建"作为一对成对操作入账，这样两笔承诺在任何时刻都不可能针对同一金额同时存在。文档称之为"整个设计中最重要的单一交易性要求"——如果两个承诺对象之间的原子性无法保证，系统就会在该时间窗口内产生重复计算。这条原理（虽然文档以完全通用、而非针对具体代码的措辞表述）正是实际 Balance Component 中复合式 Maker Submit 用同一个 businessEventId 关联两条分录的理论依据，也是为何一条孤立/被回滚的分录（例如 CLAUDE.md 中记录的 A3S SG 赎回回滚修复）被视为严重缺陷的原因。

## 来源证据

- `TF_Balance_Component_Spec-en.txt engine item E3 (§1.1): 'Atomicity of a paired release/create across two undertaking objects...a configurable transaction boundary is not a transaction boundary'`
- `TF_Contingent_Liability_Lifecycle-en.txt §1 D2`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
</content>
