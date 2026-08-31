---
knowledge_id: MAKER-CHECKER-RULE-057
title: "A4（Sight 结算）四眼关卡在服务器端强制执行，按父级合约的 tenorType === 'SIGHT' 限定范围——质量报告的回顾性复述"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - maker-checker
  - confirmed
---

# MAKER-CHECKER-RULE-057 — A4（Sight 结算）四眼关卡在服务器端强制执行，按父级合约的 tenorType === 'SIGHT' 限定范围——质量报告的回顾性复述

## 状态
CONFIRMED

## 业务规则
对于父级合约 tenorType 为 SIGHT、且没有 makerSubmittedAt 的 IPLC_LC/UTILIZE movement，release() 会抛出 409——Sight 单据到单结算，Checker Release 之前必须先有真实的 Maker-Submit 步骤。之所以要按 tenorType（而非简单的 instrumentType/movementType）来限定范围，是因为 Usance movement 与 Sight movement 共享完全相同的 (IPLC_LC, UTILIZE) 形态，但前者是通过 A6 自身的复合式 referencedTransactionId 流程 release 的，该流程按设计从不调用 maker-submit。

## 条件
movementType = UTILIZE，instrumentType = IPLC_LC，父级合约 tenorType = SIGHT。

## 结果
若 makerSubmittedAt 为 null 则返回 409；否则 release 正常进行。Usance 合约或未声明 tenorType 的合约永远不会被此关卡阻挡。

## 示例
已对全部 14（后增至 21）条业务案例注册表条目做过实地验证——只有 Import Case #1 的测试数据需要补充一次 maker-submit 调用。

## 验证说明
已完全被上文合并后的『Sight 项下 IPLC_LC/UTILIZE（A4）要求在 Checker Release 前必须有真实的 Maker Submit——服务器端强制执行，按 tenorType 限定范围（BAL-123）』规则所涵盖，该规则已纳入这条完全相同的质量报告引用，以及 CLAUDE.md 自身关于 BAL-123 的决策日志条目作为佐证。此处保留仅为可追溯到 Quality-report-balance.md 这一来源——并非独立增量证据。

## 来源证据

实现：
- `Quality-report-balance.md:273-320 (BAL-123)`

测试：
- `Quality-report-balance.md:313-320`
- `Balance-Component-Test-Case-Proposal.md:51`

## 相关知识
- [[Maker Checker Lifecycle]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
