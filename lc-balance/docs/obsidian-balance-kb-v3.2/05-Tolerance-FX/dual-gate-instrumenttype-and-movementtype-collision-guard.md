---
knowledge_id: dual-gate-instrumenttype-and-movementtype-collision-guard
title: "双重闸门（instrumentType 与 movementType 并存）冲突防护"
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

# 双重闸门（instrumentType 与 movementType 并存）冲突防护

模块注释明确说明了为何适用性检查要同时测试 instrumentType 与 movementType，而不能只依赖 movementType：SHGT 自身的 ISSUE movementType 与 LC 的 ISSUE 是完全相同的字符串。如果只检查 movementType，一旦调用方误在不适用的合约上填入了 tolerancePct，就会悄悄地把容差上浮套用到 Shipping Guarantee 的金额上。在具体实现中，instrumentType 检查先执行（在 movementType 检查之前即短路返回）。

## 来源证据

- `src/domain/tolerance.ts:22-26`
- `src/domain/tolerance.ts:56-61`
- `test/unit/domain/tolerance.test.ts:44-47`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
