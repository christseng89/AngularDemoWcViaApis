---
knowledge_id: signedamount-helper
title: "signedAmount() 辅助函数"
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

# signedAmount() 辅助函数

一个内部（未导出）函数，先查找 MOVEMENT_DIRECTION[movementType]，再将该分录的 ceilingAmount（经 parseMonetaryAmount 解析）乘以该方向值。若 movementType 在 MOVEMENT_DIRECTION 中没有对应条目，会抛出 Error，而不是默默地将其当作零效果处理。

## 来源证据

- `microservices/balance-component/src/domain/balanceDerivation.ts lines 57-63`
- `microservices/balance-component/test/unit/domain/balanceDerivation.test.ts lines 20-23 (throws test)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
</content>
