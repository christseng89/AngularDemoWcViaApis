---
knowledge_id: EXPOSURE-RULE-021
title: "SG 解除以工具本身为单位（经由 REDEEMABLE→RELEASED 两阶段、全有或全无），绝非按 MIN(单据金额, SG 金额) 匹配——依据源 Lifecycle 规格书 §4.4 自身的原理"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 分析快照中没有 .git 历史记录，参见 [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - exposure
  - confirmed
---

# EXPOSURE-RULE-021 — SG 解除以工具本身为单位（经由 REDEEMABLE→RELEASED 两阶段、全有或全无），绝非按 MIN(单据金额, SG 金额) 匹配——依据源 Lifecycle 规格书 §4.4 自身的原理

## 状态
CONFIRMED

## 业务规则
依据设计原理，Shipping Guarantee 的未结或有余额绝不应按与单据/交单金额的匹配规则来削减。解除分两个阶段：（1）覆盖单据到齐 → 状态从 OUTSTANDING 变为 REDEEMABLE，无任何 GL/余额变动；（2）承运人退回正本 SG／出具书面解除函／证明提单已交回 → 状态从 REDEEMABLE 变为 RELEASED，此时 SG 全额一次性释放，不留残余。

## 条件
SG 状态迁移由承运人一方的事件驱动（正本 SG 退回/承运人出具解除函/提单交回），而非由任何单据或交单金额驱动——这是规格书自身的设计。

## 结果
阶段 1：SG 或有余额不变，状态变为 REDEEMABLE，GL 零变动。阶段 2：SG 全额释放，状态变为 RELEASED。

## 示例
LC 100,000，首次交单 50,000，SG 55,000：若按 MIN 规则仅释放 50,000，会永久搁置 5,000 无法释放；规格书规定的正确行为是，只有在承运人退回 SG 后，才一次性释放全部 55,000。

## 验证说明
已直接对照转换后的源文件 grep 核实 §4.4 章节标题及 REDEEMABLE/RELEASED 状态迁移的措辞——确认准确描述了该文件自身所规定的设计。但本条目现已被标记为与实际上线实现之间的 CONFLICT（见配对条目）——CLAUDE.md 决策记录以及 ledger.html 自身的 Notes 第 3 项均明确指出，实际实现走的是完全相反的方向（基于 MIN() 的部分赎回，按单据金额匹配），这是一次经业务确认、刻意推翻本节规格的决定。原始候选的 status='CONFIRMED' 就「本条陈述本身准确描述了该设计文档自身的内容」这一点予以保留，同时新增了一条姊妹 CONFLICT 条目以呈现代码与文档之间的分歧，依据的是「应标注互相矛盾的候选而非默默选边」的验证原则。

## 原始码证据

实现：
- `TF_Contingent_Liability_Lifecycle-en.txt（转换版），§4.4「SG discharge — replacing the MIN() rule」，grep 核实位于第 899 行，REDEEMABLE→RELEASED 状态迁移核实位于第 915、930 行`

测试：
- `TF_Balance_Component_Spec-en.txt §12 T3, T4（本轮未独立重新通读）`

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- 为何 Shipping Guarantee（SG）以工具为单位解除，而非按金额匹配
- CONFLICT：实际上线的实现并未遵循本规则——见下文配对的 CONFLICT 条目
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
