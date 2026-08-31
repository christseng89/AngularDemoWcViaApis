---
knowledge_id: isclosemovement
title: "isCloseMovement()"
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

# isCloseMovement()

一个未导出（模块私有）的小型辅助函数：`movementType === 'CLOSE'`。displayStatus() 与 statusBadgeClass() 内部都会用它，在进入各自正常分支逻辑之前，先套用 CLOSE 分录专属的红色徽章/CLOSING-CLOSED 覆盖规则。它不属于此文件的公开导出接口，因此其他 Angular 文件都无法直接调用它。

## 来源证据

- `balance-component.model.ts:598-615`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
</content>
