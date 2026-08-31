---
knowledge_id: STATUS-RULE-014
title: "CONFLICT：数据库设计文档将修改（Amendment）描述为「新建合约版本 + markSuperseded()」协议，但实际服务代码从未执行该协议——修改实际上是以针对既有、不变合约版本的资金变动（movement）方式实现的"
domain: Balance
category: Business Rule
status: CONFLICT
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - status
  - conflict
---

# STATUS-RULE-014 — CONFLICT：数据库设计文档将修改（Amendment）描述为「新建合约版本 + markSuperseded()」协议，但实际服务代码从未执行该协议——修改实际上是以针对既有、不变合约版本的资金变动（movement）方式实现的

## 状态
CONFLICT

## 业务规则
立场 A（设计文档，Balance-Component-DB-Design.txt）：「一份合约的每一次修订（Amendment）都不是原地更新（UPDATE），而是插入一笔新的 balance_contracts 行——新版本透过 supersedes_balance_contract_id 回指旧版本，旧版本被标记为 SUPERSEDED 并透过 superseded_by_balance_contract_id 前指新版本（见 markSuperseded()）」——也就是说，修改被建模为一条版本链交易（markSuperseded() + insert()，并以 PRAGMA defer_foreign_keys=ON 包裹，以满足暂时性的前向外键引用）。立场 B（实际代码）：balanceService.ts 在每一个真实的 createContract() 调用点都硬编码 contractVersion: 1，且服务层中从未调用过 markSuperseded()；AMEND_INCREASE/AMEND_DECREASE（A2）与 AMEND（B2）纯粹是以针对同一笔、从未被替代（superseded）的合约行新增 BalanceMovements 的方式实现——已确认余额／可用余额的变动是透过 balanceDerivation.ts 汇总 RELEASED 状态的资金变动来完成，而不是透过新建合约版本。

## 条件
当前代码库中任何真实的 A2/B2 修改（Amendment）流程。

## 结果
版本链／markSuperseded()／延迟外键检查协议在 schema 层面是存在且正确的（已由一个专门的底层数据库单元测试直接验证），但从服务层的角度看是死代码／处于休眠状态——没有任何真实的修改会创建第二个 contractVersion 或调用 markSuperseded()。

## 示例
对 balanceService.ts 的 grep 搜索显示，在唯一一个真实的 createContract() 调用点（约第 1419-1420 行）出现 `contractVersion: 1`，且零次调用 markSuperseded()；整个代码库中唯一调用 markSuperseded() 的地方是 test/unit/db/schema.test.ts 自身的底层存储直接测试。

## 冲突说明
> [!warning] Sources disagree
> 这是在验证过程中浮现的真正 CONFLICT，并非原本就作为候选规则存在——将原本的候选规则「markSuperseded／新版本插入必须在同一笔事务中运行，并采用延迟外键检查」（该说法暗示这是一个正在生产环境中运作的机制）从 CONFIRMED 降级并重新定性为 CONFLICT，因为 grep 结果确认生产代码中零调用点使用 markSuperseded()，且 contractVersion 永远只会是 1。db-design-docs 中描述同一部分唯一索引（partial-unique-index）事实的近似重复候选规则，已被并入上面「至多一个 ACTIVE 合约版本」规则；其以中文撰写的「修改即版本链」框架，正是实际揭示这一冲突的线索，因此在此处被引用为立场 A。

## 验证说明
这是在验证过程中浮现的真正 CONFLICT，并非原本就作为候选规则存在——将原本的候选规则「markSuperseded／新版本插入必须在同一笔事务中运行，并采用延迟外键检查」（该说法暗示这是一个正在生产环境中运作的机制）从 CONFIRMED 降级并重新定性为 CONFLICT，因为 grep 结果确认生产代码中零调用点使用 markSuperseded()，且 contractVersion 永远只会是 1。db-design-docs 中描述同一部分唯一索引（partial-unique-index）事实的近似重复候选规则，已被并入上面「至多一个 ACTIVE 合约版本」规则；其以中文撰写的「修改即版本链」框架，正是实际揭示这一冲突的线索，因此在此处被引用为立场 A。

## 来源证据

实现：
- `microservices/balance-component/src/service/balanceService.ts:1419-1420 (contractVersion hardcoded to 1)`
- `microservices/balance-component/src/store/balanceContractStore.ts:271-290 (markSuperseded, uncalled outside tests)`
- `analysis/Balance-Component-DB-Design.txt (Chinese: '一份合約的每次修訂（Amendment）不是原地更新... 見 markSuperseded()')`

测试：
- `microservices/balance-component/test/unit/db/schema.test.ts:261-289 (the one and only caller of markSuperseded() in the repo)`

## 相关知识
- [[Close Eligibility]]
- markSuperseded()
- idx_contracts_one_active
- version-chain contract model
- [[Business-Rule-Index]]
- [[Knowledge-Gaps]]
- [[Balance-Traceability-Matrix]]
