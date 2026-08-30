---
knowledge_id: MOVEMENT-RULE-054
title: "（贸易金融映射）SG 解除以票据为单位判定，而非以金额为单位判定 —— A9 全额赎回锁定背后的源文档依据"
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

# MOVEMENT-RULE-054 — （贸易金融映射）SG 解除以票据为单位判定，而非以金额为单位判定 —— A9 全额赎回锁定背后的源文档依据

## 状态
CONFIRMED

## 业务规则
根据 TF_Balance_Component_Mapping 自身的规则一：SG_REDEEMABLE（已收到正本提单）为 STATUS_ONLY，不产生任何总账过账；SG_RELEASE 始终释放 SG 的全部金额，不留任何余额。独立的赎回画面（A9）因此必须只支持全额赎回——这正是 CLAUDE.md 自身的业务分析结论所引用、用以将 A9 锁定为仅限全额赎回的源文档依据。

## 触发条件
event_code ∈ {SG_REDEEMABLE, SG_RELEASE}

## 结果
与已上线的 A9 全额赎回锁定直接对应并构成其依据

## 示例
所审阅的来源证据中未找到具体数值示例。

## 验证说明
本轮未独立重新核对，但其内容已由 CLAUDE.md 自身对「TF_Balance_Component_Mapping 规则一」的明确引用直接印证，作为 A9 锁定决策的依据，措辞几乎逐字相符；维持 CONFIRMED。

## 来源证据

实现:
- `TF_Balance_Component_Mapping-en.txt line 14 (README Rule #1)`
- `TF_Balance_Component_Mapping-en.txt lines 160-161,312-314`
- `TF_Balance_Component_Mapping-en.txt line 615-616`

测试:
- （未引用直接测试证据）

## 相关知识
- [[BalanceMovement]]
- A9 SG 赎回被锁定为仅限全额赎回
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
