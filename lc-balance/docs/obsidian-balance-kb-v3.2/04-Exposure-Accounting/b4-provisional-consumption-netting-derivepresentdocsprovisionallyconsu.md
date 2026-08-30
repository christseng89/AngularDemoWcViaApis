---
knowledge_id: b4-provisional-consumption-netting-derivepresentdocsprovisionallyconsu
title: "B4 临时性消耗净额处理（derivePresentDocsProvisionallyConsumedIds）"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# B4 临时性消耗净额处理（derivePresentDocsProvisionallyConsumedIds）

这是 A3S 匹配 businessEventId 例外在出口侧的对应机制。一笔当下处于 PENDING 状态的保兑 HONOUR/ACCEPT（B4，Maker 已 Submit 但尚未被 Checker Release），已经透过 referencedTransactionId 引用了它打算消耗的某一笔特定 B3 提示单据。由于 B4 自身的各条分支永远会由同一次 Checker 操作一起释放，因此被引用的 B3 记录在 B4 一被 Submit 的瞬间，就会被视为临时性地已消耗——同时从 computePresentDocsEarmark 与 computePresentDocsEarmarkApproved 两者中排除——从而避免在 Submit 到 Release 这段窗口期内，把同一笔提示单据同时重复计入"仍未结的 B3 圈存"与"B4 自身的新占用"。两者的关联依据是 referencedTransactionId（而非 businessEventId），因为 B3 是在早于 B4 的、独立的一次提交中创建的。

## 来源证据

- `microservices/balance-component/src/domain/offBalanceExposure.ts:130-186, 232-251`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
