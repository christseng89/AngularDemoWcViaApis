---
knowledge_id: EXPOSURE-RULE-017
title: "EBL（出口押汇/提前融资）完全不属于 Balance Component 的范畴"
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

# EXPOSURE-RULE-017 — EBL（出口押汇/提前融资）完全不属于 Balance Component 的范畴

> 完整的范畴判断说明见 [[Balance Component Overview#范畴之外]] 的「范畴之外」小节，此处不重复展开。

## 技术重点
EBL 融资是 Loan Component 的一笔资产类交易（在 Issuing Bank 结算之前向出口商提前付款）——它从不产生 Balance Component 的 API 调用，不在本系统/测试套件的范畴内。据业务分析师确认：「Export B1–B6 的全部流程均属于 Confirmation 处理；EBL 不在 Balance Component 的范畴内。」在 Business Case Registry 中，EBL 仅表现为 note 型步骤（无 API 调用），无需为其建立专门的测试维度。

## 原始码证据

- `analysis/Balance-Component-Business-Rule-Decisions-2026-08-21.md:61-73`
- `analysis/Balance-Component-Test-Case-Proposal.md:62`

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- 未保兑 LC 的 Acceptance 属于 MEMO 敞口；EBL/IBL 资产类融资只是一个纯说明性步骤（同一事实，在 business-rule-decisions 备忘录中的重述）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
