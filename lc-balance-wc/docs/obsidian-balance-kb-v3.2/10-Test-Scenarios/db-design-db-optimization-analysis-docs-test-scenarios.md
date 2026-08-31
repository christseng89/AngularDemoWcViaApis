---
knowledge_id: db-design-db-optimization-analysis-docs-test-scenarios
title: "数据库设计 + 数据库优化分析文档 测试场景"
domain: Balance
category: Test Scenarios
snapshot_date: 2026-08-22
tags:
  - balance
  - test-scenario
---

# 数据库设计 + 数据库优化分析文档 测试场景

从本主题范围的测试文件中提取了7个测试场景。这些场景所证明的规则详见 DB Design + DB Optimization Analysis Docs 与 [[Business-Rule-Index]]。

| 场景 | 前置条件（Given） | 触发操作（When） | 预期结果（Then） | 来源 |
|---|---|---|---|---|
| 幂等的动账提交由数据库层吸收处理 | 某个 (balance_contract_id, event_seq) 组合已存在一行 balance_movements 记录。 | 同一事件被第二次提交（例如客户端在超时后进行重试）。 | UNIQUE(balance_contract_id, event_seq) 索引会拦截这次重复的 INSERT；BalanceMovementStore.insert() 捕获该约束违反，查找到既有行，并返回 {created:false, existing}，而不是抛出异常或创建重复的 PENDING 动账。——*余额影响：* 不会创建重复的动账，因此 Confirmed/Available Balance 的推导不受影响——重试请求在账本上是真正的无操作（no-op）。 | `Balance-Component-DB-Design.txt §2.3 (lines 83-91), §4.2.7 insert row (lines 430-432) — behavior description, not a named Jest spec in this document set` |
| 部分唯一索引会阻止同一逻辑合约出现第二个 ACTIVE 版本 | 某个 logical_contract_id 已恰好存在一行 status='ACTIVE' 的 balance_contracts 记录。 | 针对同一个 logical_contract_id 插入了第二行同样 status='ACTIVE' 的记录（例如某个缺陷在插入新的 Amendment 版本之前未先对旧版本调用 markSuperseded()）。 | idx_contracts_one_active（在 logical_contract_id WHERE status='ACTIVE' 上的 UNIQUE 部分索引）会在数据库层拒绝该插入，无论应用代码是否正确地对 markSuperseded()+insert() 这一对操作进行了串行化处理。——*余额影响：* 防止出现一种含糊状态——余额推导无法确定两个 'ACTIVE' 版本中哪一个才是 ceiling/tolerance 数字的权威来源。 | `Balance-Component-DB-Design.txt §2.4 (lines 93-104), §4.1.1 (lines 211-213)` |
| busy_timeout 使第二个并发写入方排队等待，而不是立即失败 | createDb() 已在打开的数据库（文件或 :memory:）上执行了 PRAGMA busy_timeout=5000。 | 两个写事务在时间上有重叠地针对同一个 SQLite 数据库发起。 | 第二个写入方会等待（内部重试）最多 5000ms 以待锁释放，而不是像修复前那样立即抛出 SQLITE_BUSY。——*余额影响：* N/A——这是持久化/加锁层的行为，不涉及余额数字测试。 | `Balance-Component-DB-Optimization-Analysis.txt P0 section (lines 55-69) — new test/unit/db/index.test.ts reads PRAGMA busy_timeout back and asserts it equals 5000` |
| 带有旧版单列 idx_contracts_parent 的磁盘数据库，在重新打开时会被自动升级为组合索引定义 | 一个既有磁盘数据库文件创建于 2026-08-21 之前，其 idx_contracts_parent 仍仅是 parent_logical_contract_id 上的单列索引。 | 在代码升级（包含 migration 12）之后，createDb() 重新打开该文件。 | Migration 12（DROP INDEX IF EXISTS + 重建）会将其替换为组合索引 (parent_logical_contract_id, instrument_type)，并通过 PRAGMA index_info 确认新的列列表以验证。——*余额影响：* N/A——仅涉及索引/查询计划行为，不改变任何存储的余额数字，只影响表外风险敞口子合约查询的查找性能。 | `Balance-Component-DB-Optimization-Analysis.txt P2 composite-index row (lines 130-134) — new test/unit/db/index.test.ts manually builds an old-index file, reopens via createDb(), and checks PRAGMA index_info` |
| 表重建迁移在零数据丢失的前提下增加了 CHECK/FK 约束，并能正确拒绝非法输入 | 一个实时开发数据库，已有 51 行 balance_contracts 记录，且迁移前的 schema 会静默接受非法枚举值和悬空的自引用 ID。 | Migration 13 执行其表重建流程（PRAGMA foreign_keys=OFF -> BEGIN -> 创建带约束的新表 -> 以显式列名执行 INSERT...SELECT -> 删除旧表 -> 重命名 -> 重建索引 -> COMMIT -> PRAGMA foreign_keys=ON）。 | 此前会被静默接受的全部 10 种非法输入（非法枚举值、悬空的自引用 FK 目标）现在都会被拒绝；此前所有合法的输入仍能通过；通过新 schema 重新打开后，实时开发数据库的行数（51）保持不变。——*余额影响：* N/A——这是 schema 完整性测试；不会重新计算任何余额数字，只是新增了写入时的校验。 | `Balance-Component-DB-Optimization-Analysis.txt P2 CHECK-constraint row (lines 136-149) — migration13DataPreservation.test.ts (before/after row comparison) and checkAndForeignKeyConstraints.test.ts (per-enum legal/illegal value tests, per-FK dangling/valid reference tests), plus a git-stash old-vs-new comparison and a direct reopen of the 51-row live dev DB` |
| 表重建迁移中途失败时会完全回滚，不留下任何半成品表 | Migration 13 的表重建事务在中途被中断（例如在 INSERT...SELECT 或索引重建过程中发生错误）。 | 该事务中止。 | SQLite 会 ROLLBACK 整个事务，原表保持完全完好，磁盘上不会留下任何半成品的替代表；下次启动时可以安全地从头重试该迁移。——*余额影响：* N/A——这是迁移安全性测试，不涉及余额计算。 | `Balance-Component-DB-Optimization-Analysis.txt P2 CHECK-constraint row (lines 136-149) — a dedicated test proving the ROLLBACK-on-mid-failure behavior` |
| 无论候选数量多少，A10/B6 Close 资格批量选择器的查询次数都是固定的 | 最多有 200 份 ACTIVE 状态的候选合约正在被评估 A10/B6 的 Close 资格，旧实现针对每个候选各调用一次 evaluateContractCloseEligibility()（每次各自发起 3-4 次查询，最坏情况下总查询数约为 1+200x4≈800 次）。 | 改为运行批量实现，使用 listByContractIds()/listShgtMovementsForParents()/listAcceptanceMovementsForParents()/listExaminationMovementsForParents()，并将预取（preFetched）数据传入 evaluateContractCloseEligibility()。 | 总查询次数下降为固定的约 5 次，与候选数量无关；jest.spyOn 确认每个批量方法都恰好被调用一次，且旧的逐条方法在此代码路径中从未被调用；通过 git-stash 新旧对比，确认得到的合格/不合格候选列表与优化前的行为逐字节一致。——*余额影响：* N/A——这是查询性能测试；符合 Close 资格的合约集合及其余额均不变，改变的只是计算该结果所需的数据库往返次数。*容差/汇率：* N/A——此项优化不涉及任何容差/ceiling/汇率逻辑，只影响资格检查时子事件数据的获取方式。 | `Balance-Component-DB-Optimization-Analysis.txt P2 N+1 row (lines 154-163) — test/unit/service/closeEligibleContractsBatch.test.ts, covering 5 candidate scenarios plus 2 clean cases` |
