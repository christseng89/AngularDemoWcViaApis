---
knowledge_id: statusbadgeicon
title: "statusBadgeIcon()"
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

# statusBadgeIcon()

纯函数，其无障碍图标（'ok'/'pending'/'cross'/'dash'）完全根据 statusBadgeClass() 已经返回的 CSS 类名字符串推导得出——绝不直接根据 status/instrumentType/movementType 重新计算。'--approved' 与 '--earmark' 都映射为 'ok'；'--pending' 映射为 'pending'；'--negative' 映射为 'cross'；其余情况（包括 '--neutral' 与空字符串）一律回退为 'dash'。

## 来源证据

- `balance-component.model.spec.ts:847-856`
- `balance-component.model.ts:590-596`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
</content>
