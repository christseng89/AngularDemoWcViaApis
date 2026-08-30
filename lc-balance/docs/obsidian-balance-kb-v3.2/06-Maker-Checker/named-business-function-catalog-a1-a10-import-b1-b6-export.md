---
knowledge_id: named-business-function-catalog-a1-a10-import-b1-b6-export
title: "具名业务功能目录（A1-A10 进口 / B1-B6 出口）"
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

# 具名业务功能目录（A1-A10 进口 / B1-B6 出口）

共有 16 个具名业务功能（进口方向：A1、A2、A3、A3S、A4、A6、A7、A8、A9、A10；出口方向：B1、B2、B3、B4、B5、B6），每个功能都固定绑定一个 instrumentType，再搭配一个固定的 movementType 或一个 subChoice——因此 Maker 永远不会直接选择原始的 (instrumentType, movementType) 组合。A5 已被废弃（合并进 A3），原因是 A3/A5 在机制上完全等同（都是 IPLC_LC/UTILIZE，差别仅在于目录中的 tenor 过滤条件）——其编号被直接退役，而非重新分配使用。

## Source Evidence

- `src/app/transaction-builder/balance-component.model.ts lines 195,266-403 (IMPORT_FUNCTIONS)`
- `src/app/transaction-builder/balance-component.model.ts lines 405-500 (EXPORT_FUNCTIONS)`
- `src/app/transaction-builder/function-strategy.spec.ts line 11 (all 16 codes asserted)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
