---
knowledge_id: EXPOSURE-RULE-016
title: "未保兑 LC 的 Acceptance 属于 MEMO 敞口（无 accountEntries）；EBL/IBL 提前融资永远只是一个纯说明性步骤，从不调用 Balance Component"
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

# EXPOSURE-RULE-016 — 未保兑 LC 的 Acceptance 属于 MEMO 敞口（无 accountEntries）；EBL/IBL 提前融资永远只是一个纯说明性步骤，从不调用 Balance Component

## 状态
CONFIRMED

## 业务规则
当不存在 Confirmation 时（即未保兑 LC），Issuing Bank Accept 会产生一笔 exposureNature=MEMO 的 Acceptance 记录，且不产生任何 accountEntries——仅作应收追踪用，而非 Export Bank 自身的负债。另外，EBL/IBL 提前融资始终被建模为 Loan Component 的一笔资产，通过一个纯信息性的「note」追踪步骤呈现，从不调用 Balance Component 的 API，且文档中明确说明不应将其与 Acceptance Liability 相加以计算总信用敞口。

## 条件
该 LC 不存在先前的 EPLC_CONFIRMATION（export-case-4/5），相对地，已保兑 LC 为 export-case-2/3。

## 结果
exposureNature=MEMO（未保兑）相对于 ACTUAL（已保兑）；无论如何，EBL/IBL 始终只是一个 note 步骤。

## 示例
export-case-4：Acceptance CREATE 的 exposureNature='MEMO'，追踪 80,000 余额，但从未存在 CONF LIAB。export-case-3：「Export Bank 通过 EBL 提前融资 80,000——属于 Loan Component 的资产……不调用 Balance Component。不应与 Acceptance Liability 相加……」

## 验证说明
单一候选，本轮未独立重新通读（属于 backend/ 层，不在本次微服务采样范围内）。鉴于引用具体且结构化，并与另行列出的「EBL 不在范畴内」规则（见下文）完全一致——后者来自另一份文件（Business Rule Decisions 备忘录），从不同来源印证了同一事实，保留为 CONFIRMED。

## 原始码证据

实现：
- `backend/data/businessCases.js:1364-1370,1610-1683,1685-1757`

测试：
- `backend/test/businessCases.test.js:44-53（每个用例的步骤清单均经过结构化验证，含 notes）`

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- EBL（出口押汇/提前融资）完全不属于 Balance Component 的范畴
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
