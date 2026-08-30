---
knowledge_id: MOVEMENT-RULE-052
title: "单据到单的 Pending->Approved 迁移，仅在真正发生 A4/A6 Release 时才会触发，绝不会在 A3/A3S 自身的 Submit 或 Checker 确认时触发"
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

# MOVEMENT-RULE-052 — 单据到单的 Pending->Approved 迁移，仅在真正发生 A4/A6 Release 时才会触发，绝不会在 A3/A3S 自身的 Submit 或 Checker 确认时触发

## Status
CONFIRMED

## Business Rule
一笔 UTILIZE 自身的 Pending 金额，只有在 A4/A6 真正对其进行最终确认/放行时，才会完全迁移为 Approved——既不会在 A3/A3S 自身的 Submit 时发生，也不会在 A3 自身的 Checker『Approve』（仅为确认，状态维持 PENDING）时发生。EARMARKING 标签在确认环节始终保持不变，只有在真正的最终放行时才会翻转为 EARMARKED。

## Conditions
该动账为 IPLC_LC/UTILIZE（单据到单）

## Result
EARMARKING 标签在确认环节始终保持不变；只有在真正的最终放行时才会翻转为 EARMARKED

## Example
所审阅的源证据中没有可用的具体数值示例。

## Verification Note
本轮未独立重新阅读，但与 CLAUDE.md 中的 REQUIREMENT 表（进口 A3/A3S、出口 B3：未放行=EARMARKING，已放行=EARMARKED）以及在别处已验证过的 isEarmarkFunction() 设计直接一致；维持 CONFIRMED。

## Source Evidence

Implementation:
- `Balance-Figures-Calculation-Logic.txt lines 403-420`

Tests:
- （未引用直接测试证据）

## Related Knowledge
- [[BalanceMovement]]
- Document Arrival Pending/Approved Lifecycle
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
