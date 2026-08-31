---
knowledge_id: tf-mapping-workbook-three-rules-that-must-not-be-configured-away
title: "TF 对照工作簿 — 三条不得被配置绕过的规则"
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

# TF 对照工作簿 — 三条不得被配置绕过的规则

对照工作簿自身的 README 明确规定了三条不容任何银行端配置参数覆写的强制性规则：（1）SG 的解付以工具类型为准，而非以金额为准——SG_REDEEMABLE 属 STATUS_ONLY，不产生总账动作；SG_RELEASE 永远释放全部未偿金额，绝非部分释放；唯一的例外是与单据匹配的复合提交情形（A3S），此时被赎回的金额与已确认到达的单据相挂钩。（2）无论进口侧或出口侧，承兑与 DPU 在本质上都是真正的表内项目——影子备忘记账对仅供 MIS 使用，绝不可流入财务报表。（3）会计/风险/监管逻辑绝不可单独由 tenorType 驱动——必须依据 undertakingAvailability/financingStructure/fundingParty/availableWith 推导，并留存相应的留痕记录。规则（1）正是 CLAUDE.md 中已记录为经业务分析师（BA）核实、透过 A9 全额赎回锁定机制解决的那一条。

## Source Evidence

- `TF_Balance_Component_Mapping-en.txt lines 13-16 (README: 'Three rules that must not be configured away')`

## Related Knowledge

- [[Business-Rule-Index|业务规则索引]]
- [[Balance Component Overview|余额组件概览]]
