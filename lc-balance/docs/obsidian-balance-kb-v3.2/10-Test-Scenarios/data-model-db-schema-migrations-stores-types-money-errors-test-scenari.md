---
knowledge_id: data-model-db-schema-migrations-stores-types-money-errors-test-scenari
title: "数据模型——数据库 Schema、迁移、Store、Types/Money/Errors 测试场景"
domain: Balance
category: Test Scenarios
snapshot_date: 2026-08-22
tags:
  - balance
  - test-scenario
---

# 数据模型——数据库 Schema、迁移、Store、Types/Money/Errors 测试场景

从本主题范围的测试文件中提取了16个测试场景。这些场景所证明的规则详见 Data Model — DB Schema, Migrations, Stores, Types/Money/Errors 与 [[Business-Rule-Index]]。

| 场景 | 前置条件（Given） | 触发操作（When） | 预期结果（Then） | 来源 |
|---|---|---|---|---|
| 只有真实的磁盘数据库文件才会启用 WAL 日志模式，:memory: 永远不会 | 分别以真实文件路径和 ':memory:' 各调用一次 createDb() | 对生成的每个 Db 查询 PRAGMA journal_mode | 以文件为后端的 db 报告为 'wal'；:memory: 的 db 则不是 | `microservices/balance-component/test/unit/db/index.test.ts:29-71` |
| busy_timeout=5000ms 无条件地同时设置在真实文件与 :memory: 上 | 分别以真实文件路径和 ':memory:' 调用 createDb() | 对每个都查询 PRAGMA busy_timeout | 两者均报告为 5000，这与仅适用于文件的 WAL pragma 不同 | `microservices/balance-component/test/unit/db/index.test.ts:77-87` |
| 第二次重新打开同一个真实数据库文件时，已应用的迁移不会重复生效 | 通过 createDb() 创建过一次的真实磁盘数据库文件 | 针对同一文件路径再次调用 createDb() | 此前添加的列依然存在，第二次打开时不会抛出任何错误 | `microservices/balance-component/test/unit/db/index.test.ts:89-101` |
| 带有旧版单列 idx_contracts_parent 的既有磁盘数据库，在重新打开时会被升级为组合索引定义 | 一个旧版磁盘数据库文件，其 idx_contracts_parent 仅定义在 parent_logical_contract_id 上，且没有 schema_migrations 表 | createDb() 打开该文件 | idx_contracts_parent 变为 (parent_logical_contract_id, instrument_type) 上的组合索引 | `microservices/balance-component/test/unit/db/index.test.ts:108-132` |
| 当既有行违反新的 CHECK 约束时，Migration 13 会原子性地回滚 | 在迁移运行之前，插入了一行 instrument_type='NOT_A_REAL_INSTRUMENT_TYPE' 的 balance_contracts 记录 | runMigrations() 执行，运行到 migration 13 的表重建阶段 | runMigrations() 抛出异常；migration 1-12 仍被记录为已应用，但 13 未被记录；该脏行以及整个 balance_contracts 表逐字节保持不变；不会残留任何 _new 临时表；删除该脏行后再次运行迁移即可完全成功 | `microservices/balance-component/test/unit/db/migrations.test.ts:78-116` |
| Migration 13 会精确保留每一行既有列的值，包括同一次重建批次中自引用的行 | balance_contracts/balance_movements 中的行覆盖了每一种 InstrumentType/ContractStatus/TenorType（含 NULL）/MovementType/MovementStatus/ExposureNature，且部分行的 supersedes_/superseded_movement_id/reversal_of_movement_id 指向同一批次中的兄弟行 | runMigrations() 在 migration 13 下重建这两张表 | 每一行的列值在重建前后完全一致（通过整行相等性验证），且自引用的行即便与其所引用的行在同一次 INSERT...SELECT 批次中一并复制，也依然完好保留 | `microservices/balance-component/test/unit/db/migration13DataPreservation.test.ts:21-266` |
| (balanceContractId, eventSeq) 幂等性——重复提交会返回原始行，而不是新的载荷 | 某合约上 eventSeq 为 1 的一笔动账已插入，amount 为 '100000' | 针对相同的 (contractId, eventSeq) 再次尝试 insert()，amount 为 '999999' | insert() 返回 {created:false, existing}，其中 existing.movementId 即第一笔动账的 id——重复提交的金额被丢弃——*余额影响：* 无——原始动账的金额/影响保持不变；重复提交本身不产生任何余额影响。 | `microservices/balance-component/test/unit/db/schema.test.ts:79-89` |
| 每个 logicalContractId 最多只能有一个 ACTIVE 合约版本，由数据库强制约束 | 某 logicalContractId 已存在一个 ACTIVE 状态的合约 | 针对同一个 logicalContractId 插入第二条 status='ACTIVE' 的合约行 | 该插入会抛出 UNIQUE 约束违反错误 | `microservices/balance-component/test/unit/db/schema.test.ts:69-73` |
| CHECK 约束会拒绝全部 6 个受约束列上的每一个非法枚举值，并接受每一个真实合法值 | 一次绕过应用/存储层自身校验的原始 SQL 插入 | 将 instrument_type/status/tenor_type（balance_contracts）或 movement_type/exposure_nature/status（balance_movements）中的某一列设置为超出其声明合法列表的值 | SQLite 抛出 'CHECK constraint failed'；每一列每一个真正合法的值都能被无错误地接受 | `microservices/balance-component/test/unit/db/checkAndForeignKeyConstraints.test.ts:58-166` |
| 自引用的 FK 列会拒绝悬空引用，并接受真实引用 | 设置了 supersedes_balance_contract_id / superseded_by_balance_contract_id / superseded_movement_id / reversal_of_movement_id | 所引用的 id 分别为不存在与存在（包括同一测试中此前插入的兄弟行） | 悬空引用会抛出 'FOREIGN KEY constraint failed'；真实引用则会被接受 | `microservices/balance-component/test/unit/db/checkAndForeignKeyConstraints.test.ts:168-208` |
| 在同一事务的延迟 FK 检查下，markSuperseded 与新版本插入能够一并成功 | 合约 v1 处于 ACTIVE 状态；已设置 PRAGMA defer_foreign_keys=ON 并开启一个事务 | 在插入 v2 之前调用 markSuperseded(v1, v2Id, effectiveTo)，随后插入 v2，再执行 COMMIT | 整个流程成功——v1 变为 SUPERSEDED 并指向 v2，v2 为 ACTIVE——因为前向 FK 引用是在 COMMIT 时才被校验，而非逐语句校验 | `microservices/balance-component/test/unit/db/schema.test.ts:261-290` |
| 非 UNIQUE 类型的数据库错误（FK 违反）会原样重新抛出，绝不会被当作幂等重复提交而吞掉 | 某 id 不存在任何匹配的 balance_contracts 行 | 使用该虚假的 balanceContractId 调用 BalanceMovementStore.insert() | 该调用会抛出 'FOREIGN KEY constraint failed'——insert() 中处理 UNIQUE 违反的重复提交路径不会拦截这一错误 | `microservices/balance-component/test/unit/db/schema.test.ts:292-299` |
| 货币小数位数违规会同时报告实际位数与允许的位数 | amount 为 '10000.50'，currency 为 JPY（允许 0 位小数） | describeAmountScaleViolation() 或 zod 请求 schema 对该组合进行校验 | 会生成违规信息 'amount "10000.50" has 2 decimal place(s) but currency JPY allows at most 0'（无论输入的大小写如何，货币代码都会被转为大写） | `microservices/balance-component/test/unit/errorsAndMoney.test.ts:101-107; microservices/balance-component/test/unit/validation/requestSchema.test.ts:66-72` |
| 无法识别的货币仍会强制执行小数位数检查，默认按 2 位小数处理 | 货币 'XYZ' 不存在于 CURRENCY_MINOR_UNITS 中 | 调用 minorUnitsForCurrency('XYZ') | 返回 2（不会像姊妹项目 payment-component 针对未知货币那样跳过小数位数检查） | `microservices/balance-component/test/unit/errorsAndMoney.test.ts:77-79` |
| zod schema 的 passthrough 机制会完整保留其必填集合之外的所有字段，不做剥离 | 一个请求体，除 6 个必填字段外，还带有 naturalKey、tolerancePct、parentLogicalContractId | createMovementRequestSchema.safeParse() 对其进行校验 | 校验通过，且这三个额外字段在 result.data 中原样保留 | `microservices/balance-component/test/unit/validation/requestSchema.test.ts:23-32` |
| eventSeq:0 会被当作真实值接受，而不是被当作缺失/假值处理 | 一个与最小有效请求体相同、仅 eventSeq 为 0 的请求体 | 该 schema 对其进行校验 | 校验通过（相对比：真正缺失 eventSeq 键，或 eventSeq 为非数字（如字符串 '1'）的情况，均会校验失败） | `microservices/balance-component/test/unit/validation/requestSchema.test.ts:41-56` |
