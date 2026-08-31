---
knowledge_id: discrepant-documents-outcome-branch-import-side
title: "不符点单据的结果分支（进口方向）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 不符点单据的结果分支（进口方向）

| 分支 | 触发条件 | 表外影响 | 最终余额结果 |
|---|---|---|---|
| COMPLYING（相符） | 审单后未发现不符点 | 按 §3.5/§3.6/§3.7 承付 | 标准承付路径 |
| DISCREPANT（不符）→ 拒付 | 在 5 个银行工作日内发出拒付通知（UCP 第 16 条） | 表外余额不变 | 单据留待交单人处置 |
| DISCREPANT（不符）→ 申请人接受放弃不符点 | 申请人放弃不符点主张 | 使承付得以进行，自身不引发余额变动 | 转入承付流程 |
| DISCREPANT（不符）→ 保留付款／凭偿付保证书付款 | 银行付款但保留追索权 | 表外余额予以释放 | 属附追索权垫款，并非清洁提用 |
| 已开立装船保函（SG） | 该保函覆盖同一批货物 | 拒付在经济上已不可行（申请人已放弃不符点主张） | 承付实质上已成为必然；信用转换系数（CCF）重新按 100% 加权 |
| 权利排除（UCP 第 16(f) 条） | 5 个银行工作日届满仍无有效拒付通知 | 系统自动触发，无需操作人员介入 | 重新按 100% 加权；阻止此后任何拒付主张 |

## 来源证据

- `TF_Balance_Component_Spec-en.txt §3.4 branch diagram`

## 相关知识

- Foundational Design-Rationale Docs (TF Balance Spec + Contingent Liability Lifecycle)
- [[Business-Rule-Index]]
