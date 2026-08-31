---
knowledge_id: EXPOSURE-RULE-014
title: "A3S/A9 自身的 LC 层级 SG 余额资格提示（该 LC 是否存在任何未结 SG）"
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

# EXPOSURE-RULE-014 — A3S/A9 自身的 LC 层级 SG 余额资格提示（该 LC 是否存在任何未结 SG）

## 状态
CONFIRMED

## 业务规则
对于 A3S 的扁平 Catalog 选择器与 A9 的 Parent LC 选择器而言，只有当一张 LC 至少存在一个实时快照显示可用余额非零的 SHGT 子合约时，该 LC 才会被标记为具备资格提示。

## 条件
存在某个子 SHGT 合约 c，使得 getSnapshot(c).availableBalance !== '0'。

## 结果
balanceContractId 会被加入 catalogSgEligible（A3S）/ parentSgEligible（A9）两个 Set 中，供各组件自身的 filteredXxxCatalog getter 消费。

## 示例
一张 LC 有两个 SHGT 子项，其中一个已完全赎回、另一个仍有 5,000 可用余额，该 LC 在 A3S 与 A9 中仍具备资格。

## 验证说明
单一候选，与上文的姊妹选择器规则有相同的局限（Angular 端，本轮未独立重新通读）。鉴于引用具体可信、且与姊妹规则内部一致，保留为 CONFIRMED。

## 原始码证据

实现：
- `src/app/transaction-builder/document-arrival-hints.service.ts:161-192`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- A3S 自身的 SG 赎回选择器会排除任何实时可用余额为零的 SG
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
