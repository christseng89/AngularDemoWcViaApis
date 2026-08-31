---
knowledge_id: step-level-reference-resolution-mechanics
title: "步骤层级的引用解析机制"
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

# 步骤层级的引用解析机制

runCase() 中有三种不同的 *Ref 字段，各自的解析方式并不相同：balanceContractIdRef 会直接从已捕获的 createMovement 响应中内联替换（不产生额外的 API 调用）；parentLogicalContractIdRef 则需要针对每一个不同的已捕获合约额外调用一次 GET /balance-contracts/:id/balance 以读取 logicalContractId，该结果会缓存在对应的捕获条目上，因此同一引用第二次使用时不会重新抓取；referencedTransactionIdRef（于 2026-08-16 为支持 B3→B4 复合结构而新增）会内联解析为更早某个步骤所捕获的真实 movementId，同样不产生额外调用。movementRef（用于 release/makerSubmit）与 contractRef（用于 snapshot）都会解析为一个已捕获的 movementId/balanceContractId，无需额外查找。

## Source Evidence

- `backend/server.js:37-46,75-124`
- `backend/test/server.test.js:140-184 (parentLogicalContractIdRef +1 fetch; referencedTransactionIdRef +0; caching verified via export-case-6's two uses of 'conf')`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
