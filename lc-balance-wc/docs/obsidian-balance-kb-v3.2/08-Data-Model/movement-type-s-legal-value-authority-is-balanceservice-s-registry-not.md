---
knowledge_id: movement-type-s-legal-value-authority-is-balanceservice-s-registry-not
title: "movement_type 的合法值权威来源是 BalanceService 的登记表，而非 types.ts"
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

# movement_type 的合法值权威来源是 BalanceService 的登记表，而非 types.ts

与其他五个类枚举字段（instrument_type/status/tenor_type/exposure_nature/合约状态）不同，movement_type 在 types.ts 中并没有对应的 TypeScript 联合类型——它只是一个普通字符串。合法值的真正权威来源是 BalanceService 自身的 buildMovementTypeRegistry()，并在 createMovement() 内部于运行期强制校验（未知值会抛出异常）。schema.ts 中 movement_type 的 CHECK 约束刻意是从这份登记表的键集合复制而来，而不是从 types.ts 复制，为的是避免有人误以为所有类枚举字段都可以直接从 types.ts 照抄这一已被记录在案的风险。

## 来源证据

- `Balance-Component-DB-Design.txt §5.6 (lines 581-591)`
- `Balance-Component-DB-Optimization-Analysis.txt P2 CHECK-constraint row (lines 136-149)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
