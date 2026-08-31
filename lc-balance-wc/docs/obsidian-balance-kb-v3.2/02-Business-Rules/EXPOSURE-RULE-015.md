---
knowledge_id: EXPOSURE-RULE-015
title: "A3S 已匹配 SG 赎回的顺序：先创建 SG 赎回（PENDING），再以相同 businessEventId 创建 Document Arrival UTILIZE——这是实现轧差（netting）的机制"
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

# EXPOSURE-RULE-015 — A3S 已匹配 SG 赎回的顺序：先创建 SG 赎回（PENDING），再以相同 businessEventId 创建 Document Arrival UTILIZE——这是实现轧差（netting）的机制

## 状态
CONFIRMED

## 业务规则
当一笔 SG 的 PARTIAL_REDEEM/FULL_REDEEM 异动在仍为 PENDING 状态时被创建，且与随后立即在同一张 LC 上提交的 Document Arrival（UTILIZE）共享同一个 businessEventId 时，该笔赎回金额会在 Document Arrival 自身的充足性检查运行之前，先从该 LC 的表外敞口中被轧差扣除——这使得该交单能够成功通过，而若是一笔未匹配的普通 Document Arrival，相同金额则会被直接硬性拒绝。这是「已合并的 SHGT 表外敞口」规则中「已匹配 businessEventId 例外情形」在客户端调用顺序层面的具体落地。

## 条件
SG 赎回异动先创建（仍为 PENDING），且与随后在同一张 LC 上的 Document Arrival UTILIZE 共享同一个 businessEventId。

## 结果
该笔 Document Arrival 自身的充足性检查会通过；最终的 LC/SG 余额，与一笔针对已匹配部分金额、未匹配的普通 Document Arrival 所产生的结果一致。

## 示例
import-case-4：SG 未结余额 100,000，先以 PENDING 状态创建 SG PARTIAL_REDEEM 50,000（businessEventId 为 `${lc}-arrival`），随后以相同 businessEventId 创建 Document Arrival UTILIZE 50,000，成功过账（LC 的 Tight Available 正确显示为 71,000）。

## 验证说明
并非核心敞口公式规则的重复——本候选描述的是 Business Case Registry 层面的编排/顺序机制（哪一方先创建），是独立的、相互印证的事实，而非公式本身的重述。保留为独立的 CONFIRMED 规则，与已合并的公式规则互相交叉引用。

## 原始码证据

实现：
- `backend/data/businessCases.js:326-446`

测试：
- `backend/data/businessCases.js:555-618（import-case-6 自身的两组已匹配配对，已通过该用例自身的快照预期核实）`

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- A3S 已匹配 businessEventId 的 SG 赎回轧差顺序
- SHGT 表外敞口公式（上文合并规则）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
