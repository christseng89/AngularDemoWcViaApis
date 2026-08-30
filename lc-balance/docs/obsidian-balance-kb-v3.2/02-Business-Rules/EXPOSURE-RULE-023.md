---
knowledge_id: EXPOSURE-RULE-023
title: "LC+SG 合并敞口按每笔关联装运取 MAX（经济/CCF 加权视角），从不取 SUM 或直接轧差——源规格书原理，Balance Component 自身的 GL 并未实现"
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

# EXPOSURE-RULE-023 — LC+SG 合并敞口按每笔关联装运取 MAX（经济/CCF 加权视角），从不取 SUM 或直接轧差——源规格书原理，Balance Component 自身的 GL 并未实现

## 状态
CONFIRMED

## 业务规则
依据源规格书，针对每一笔关联装运，经济敞口 E_shipment = MAX(该装运对应的已圈存/已动用 LC 金额, SG 金额)——而不是两笔表内总账余额的简单相加，也不是直接轧差。一旦 SG 开出，其覆盖的 LC 部分还会从 20% 贸易类 CCF 重新加权为 100%（视同直接信用替代），标的货物的抵押品价值则归零。

## 条件
一笔 SG 已开出并关联到某张 LC，该 LC 的单据已经（或将要）针对同一笔装运交单。

## 结果
组合敞口（依规格书自身的风险/监管资本视角）= Σ E_shipment（按装运取 MAX，100% CCF）+ 未动用/未与任何 SG 关联的 LC 金额（20% CCF）+ 其他项目按各自 CCF 计算。GL 本身（即 Balance Component 自身的 ledger.html 所记录、代码所实现的内容）仍然分别独立地记录 LC 与 SG 两者未经轧差的完整表内余额——这条 MAX 规则是一个外部的经济/监管资本叠加视角，而非 Balance Component 的 GL 过账规则。

## 示例
LC 100,000，首笔装运 50,000 由 SG 55,000 覆盖：E_shipment = MAX(50,000, 55,000) = 55,000，按 100% CCF 计算；简单相加（155,000）会高估敞口，但 GL 出于会计/审计目的仍记录全额 155,000——这与本组件自身已记载的范畴边界一致，即它追踪的是 GL 敞口，而非这一经济资本 MAX 视角。

## 验证说明
已直接对照转换后的源文件 grep 核实——§4.5 标题、MAX() 公式，以及算例（50,000/55,000/65,000 推导出的 MAX 型 EAD）均确认存在且相符。在验证过程中于 businessRule/result 字段中做了澄清（这是验证时的真实补充，而非凭空新增规则）：这一 MAX/CCF 视角是源规格书所描述的、明确的风险/资本叠加层，与本规则集中已另行确立的「Balance Component 自身仅限 GL 范畴」的边界相区分，而非矛盾；微服务中没有任何代码实现这一 MAX 计算，这与本组件已记载的范畴一致。

## 原始码证据

实现：
- `TF_Contingent_Liability_Lifecycle-en.txt §4.5, §10.2（转换版，grep 核实：「敞口规则——为何答案是重新加权而非轧差」位于第 955 行，MAX 公式位于第 1001 行，算例位于第 1025-1041 行）`

测试：
- `TF_Balance_Component_Spec-en.txt §12 T5（本轮未独立重新通读）`

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- 为何 LC + SG 合并敞口取 MAX 而非 SUM，并在 SG 开出后重新加权 CCF
- 范畴边界——Balance Component 仅覆盖或有/表外 GL 敞口，不涉及经济/监管资本叠加层
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
