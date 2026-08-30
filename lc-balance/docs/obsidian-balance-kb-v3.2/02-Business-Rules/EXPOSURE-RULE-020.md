---
knowledge_id: EXPOSURE-RULE-020
title: "Acceptance/DPU 在承兑发生的当下即以表内、全额方式确认；影子备忘配对仅用于报告（源规格书原理）"
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

# EXPOSURE-RULE-020 — Acceptance/DPU 在承兑发生的当下即以表内、全额方式确认；影子备忘配对仅用于报告（源规格书原理）

## 状态
CONFIRMED

## 业务规则
当银行承兑一张汇票或产生一笔 DPU 时，该笔交易会释放 LC/Confirmation 的或有敞口，同时确认一笔真实的表内负债（Acceptances & DPU Outstanding），并以一笔表内资产（Acceptance Reimbursement Receivable）与之匹配。对同一债务人的总信用敞口保持不变，但呈现方式从表外或有变为表内全额，CCF/RWA 处理方式也从 20% 贸易类转为 100% 已放款债权。

## 条件
movementType = ACCEPT/带承兑可用性的 HONOUR_BU，作用于承兑方式为 ACCEPTANCE 或 DEF_PAYMENT 的 LC/Confirmation。

## 结果
LC/Confirmation 或有敞口减少；表内负债与表内资产同步增加，两者均为全额，外加一笔仅用于 MIS/MT 对账的 MEMO_ONLY 影子配对。

## 示例
LC 100,000，SU 承兑 50,000：DC Outstanding — SU 从 100,000 降至 50,000；Acceptances & DPU Outstanding 与 Acceptance Reimbursement Receivable 均从 0 升至 50,000；对申请人的总信用敞口维持在 100,000 不变。

## 验证说明
保留为 CONFIRMED——这是源头权威的规格/设计原理文档（证据优先级第 5 层），而非代码，但其核心主张已被上文验证过的 ledger.html 实现规则独立佐证（exposureNature=ACTUAL、影子备忘框架），因此设计文档的原理与实际实现相互印证，反而增强而非削弱了置信度。

## 原始码证据

实现：
- `TF_Contingent_Liability_Lifecycle-en.txt（转换版）——grep 核实 §3.7 关于「Classification note」/「Acceptances & DPU」的讨论，与 contingent-liability-ledger.html 第 574、642-643、665、668 行的内容一致，后者直接引用了本源文件的原理`

测试：
- `TF_Balance_Component_Spec-en.txt §12 T6（设计文档参考，本轮未独立重新通读）`

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- Acceptance/DPU 为何以表内方式入账，而非作为或有备忘配对
- Acceptance/DPU 是一笔影子备忘分录，而非真正的或有科目类型（实现层对应规则，保留独立）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
