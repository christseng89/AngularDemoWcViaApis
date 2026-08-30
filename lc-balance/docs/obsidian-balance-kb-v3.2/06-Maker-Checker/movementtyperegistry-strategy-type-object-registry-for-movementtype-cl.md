---
knowledge_id: movementtyperegistry-strategy-type-object-registry-for-movementtype-cl
title: "movementTypeRegistry（用于 movementType 分类的 Strategy/Type-Object 注册表）"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 本次分析快照中无 .git 历史记录，详见 [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# movementTypeRegistry（用于 movementType 分类的 Strategy/Type-Object 注册表）

BalanceService 会为每个实例构建一张查找表（buildMovementTypeRegistry()，以 movementType 字符串为键），将每个 movementType 映射为 { isCreating: boolean, checkSufficiency: fn }。这取代了此前四个各自独立的分类 Set（CREATING/NO_CHECK/UTILIZE_SHAPED/OUTSTANDING_CAPPED）以及一整条 if/else-if 判断链（BAL-141）。该表在构造函数中只构建一次，因为其中两个闭包（decreaseShaped/utilizeShaped）需要捕获 `this.movements`，以便获取同一父级下的 SHGT/EPLC_EXAMINATION 兄弟记录，用于表外（off-balance）净额计算。createMovement() 会查找 `this.movementTypeRegistry[req.movementType]`，若该 movementType 无法识别，则抛出 RequestValidationError。

## Source Evidence

- `balanceService.ts:1025-1041 (createMovement() lookup + throw)`
- `balanceService.ts:52-255 (buildMovementTypeRegistry)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
