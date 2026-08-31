---
knowledge_id: Data-Model-Concepts-Index
title: "数据模型概念索引"
domain: Balance
category: Index
snapshot_date: 2026-08-22
tags:
  - balance
  - index
---

# 数据模型概念索引

`08-Data-Model/` 目录下的每一篇笔记（共 53 篇），方便直接浏览该知识库区域。

- [[amenddecreasecheckresult-discriminated-union|AMEND_DECREASE 充足性检查结果的可辨识联合类型]]
- [[amendment-version-chain-contract-supersession|修改版本链（合约版本替代）]]
- [[append-only-movement-history-preserves-the-maker-checker-audit-trail|只追加式流水历史保留 Maker/Checker 审计轨迹]]
- [[at-most-one-active-contract-version-per-logicalcontractid-db-enforced|每个 logicalContractId 至多一个 ACTIVE 合约版本，由数据库强制保证]]
- [[balance-movements-table-growth-pattern-repeated-alter-table-for-new-xx|balance_movements 表的增长模式：为新增的 xxx_by/xxx_at 角色-动作列反复执行 ALTER TABLE]]
- [[balancecontractstore-thin-repository-over-balance-contracts|BalanceContractStore ——覆盖在 balance_contracts 之上的轻量级仓储层]]
- [[balancemovementstore-append-only-repository-over-balance-movements|BalanceMovementStore ——覆盖在 balance_movements 之上的只追加式仓储层]]
- [[balancemovementstore-insert-idempotent-create-on-balancecontractid-eve|BalanceMovementStore.insert() ——基于 (balanceContractId, eventSeq) 的幂等创建]]
- [[balancesnapshot-shape-and-its-persisted-snapshot-column-family|BalanceSnapshot 的结构及其持久化快照列族]]
- [[busy-timeout-5000ms-as-the-mechanism-that-turns-sqlite-busy-into-queue|busy_timeout=5000ms 是把 SQLITE_BUSY 转化为排队串行化的机制]]
- [[catalogfilter-pagination-substring-exact-match-tenor-family-and-issue-|CatalogFilter ——分页、子字符串/精确匹配、期限族群与"已放单"资格过滤]]
- [[check-constraints-and-self-referencing-fks-added-via-full-table-rebuil|通过整表重建迁移（migration 13）新增的 CHECK 约束与自引用外键]]
- [[check-constraints-are-defense-in-depth-against-non-app-writers-not-jus|CHECK 约束是针对非应用层写入者的纵深防御，而不仅是应用层校验]]
- [[concurrency-model-current-sqlite-whole-file-lock-vs-required-postgresq|并发模型：现行 SQLite 整文件锁 与 未来必需的 PostgreSQL 行级锁]]
- [[createdb-initialization-sequence|createDb() 初始化流程]]
- [[createdb-pragma-initialization-sequence|createDb() 的 PRAGMA/初始化流程]]
- [[currency-minor-units-server-side-currency-decimal-scale-enforcement-un|CURRENCY_MINOR_UNITS ——服务端货币小数精度强制校验，未知币种默认 2 位小数]]
- [[describeamountscaleviolation-pure-non-throwing-scale-check-reused-by-b|describeAmountScaleViolation() ——纯函数、不抛异常的精度检查，供路由层与 zod schema 共用]]
- [[enum-value-authorities-types-ts-unions-for-5-columns-movementtyperegis|枚举值权威来源：5 个列由 types.ts 联合类型定义，第 6 个由 movementTypeRegistry 定义]]
- [[errors-ts-typed-apierror-hierarchy-mapped-1-1-onto-oas-response-codes|errors.ts ——与 OAS 响应代码一一对应的类型化 ApiError 继承体系]]
- [[event-snapshot-column-write-semantics-coalesce-preserve-vs-explicit-in|事件快照列的写入语义：COALESCE 保留 vs. 显式的 'in params' 空值写入]]
- [[eventseq-0-is-a-real-meaningful-value-not-treated-as-missing|eventSeq 为 0 是一个真实、有意义的值——不会被当作缺失处理]]
- [[idempotency-key-unique-balance-contract-id-event-seq-resubmission-retu|幂等键：UNIQUE(balance_contract_id, event_seq)，重复提交返回原始记录]]
- [[idempotency-key-unique-balance-contract-id-event-seq|幂等键：UNIQUE(balance_contract_id, event_seq)]]
- [[idempotent-movement-insert-unique-idempotency-key-handling|幂等的流水插入（UNIQUE 幂等键处理）]]
- [[idx-contracts-one-active-partial-unique-index-enforces-the-single-acti|idx_contracts_one_active 部分唯一索引在数据库层强制保证"单一 ACTIVE 版本"不变式]]
- [[idx-contracts-parent-upgraded-to-composite-index-parent-logical-contra|idx_contracts_parent 升级为复合索引 (parent_logical_contract_id, instrument_type)]]
- [[marksuperseded-markclosed-contract-version-transition-helpers|markSuperseded/markClosed 合约版本状态转换辅助方法]]
- [[migration-1-11-incremental-alter-table-add-column-each-self-checking-v|Migration 1-11：渐进式 ALTER TABLE ADD COLUMN，每一步都通过 PRAGMA table_info 自检]]
- [[migration-12-idx-contracts-parent-upgraded-from-single-column-to-compo|Migration 12：idx_contracts_parent 从单列索引升级为复合索引]]
- [[migration-13-check-constraint-self-referencing-fk-retrofit-via-sqlite-|Migration 13：通过 SQLite 12 步整表重建流程改造，新增 CHECK 约束与自引用外键]]
- [[migration-13-check-fk-retrofit-via-sqlite-12-step-table-rebuild|Migration 13 ——通过 SQLite 12 步整表重建改造 CHECK/外键约束]]
- [[migration-array-append-only-convention|Migration 数组的只追加约定]]
- [[migration-runner-schema-migrations-tracked-migration-array|Migration 执行器：由 schema_migrations 追踪的 Migration 数组]]
- [[money-amounts-stored-as-text-decimal-strings-never-native-numeric-type|金额一律以 TEXT 十进制字符串存储，从不使用原生数值类型]]
- [[money-ts-sole-authority-for-constructing-a-decimal-from-a-wire-monetar|money.ts ——将报文金额字符串构造为 Decimal 的唯一权威来源]]
- [[movement-type-registry-15-legal-values|movement_type 注册表——15 个合法取值]]
- [[movement-type-s-legal-value-authority-is-balanceservice-s-registry-not|movement_type 的合法值权威来源是 BalanceService 的注册表，而非 types.ts]]
- [[n-1-query-pattern-fixed-in-a10-b6-close-eligibility-batch-picker|A10/B6 Close 资格批量选择器中修复的 N+1 查询问题]]
- [[natural-key-vs-surrogate-key-coexistence|自然键与代理键并存]]
- [[naturalkeyalreadyexistserror-re-issue-guard-against-an-already-active-|NaturalKeyAlreadyExistsError ——针对已存在 ACTIVE 自然键的重复 ISSUE 防护]]
- [[node-sqlite-chosen-over-better-sqlite3-for-prototype-environment-reaso|选用 node:sqlite 而非 better-sqlite3，是出于原型环境的考量，而非架构偏好]]
- [[node-sqlite-databasesync-as-the-persistence-engine-no-better-sqlite3|以 node:sqlite 的 DatabaseSync 作为持久化引擎（不使用 better-sqlite3）]]
- [[non-sargable-like-search-deliberately-not-optimized-a-business-tradeof|非可优化（non-sargable）的 LIKE 搜索刻意未做优化——这是业务权衡，而非技术缺陷]]
- [[parent-logical-contract-id-is-an-application-layer-only-relationship-n|parent_logical_contract_id 仅是应用层关系，并非数据库外键]]
- [[pragma-busy-timeout-5000-fixed-2026-08-21-p0|PRAGMA busy_timeout=5000 ——已于 2026-08-21 修复（P0）]]
- [[redeemcheckresult-discriminated-union|赎回充足性检查结果的可辨识联合类型]]
- [[requestschema-ts-zod-schema-for-post-balance-movements-scoped-to-exact|requestSchema.ts ——POST /balance-movements 的 zod schema，范围严格对齐此前手写校验逻辑]]
- [[self-referencing-fk-columns-supersedes-superseded-by-superseded-moveme|自引用外键列（supersedes/superseded_by、superseded_movement_id/reversal_of_movement_id）]]
- [[snapshot-on-write-for-inquire-events|面向 Inquire Events 的写时快照（Snapshot-on-write）]]
- [[sqlite-whole-file-locking-cannot-demonstrate-true-per-instrument-concu|SQLite 整文件锁无法体现真正的按实例（per-instrument）并发]]
- [[table-rebuild-migration-for-adding-check-fk-constraints-migration-13|用于新增 CHECK/外键约束的整表重建迁移（migration 13）]]
- [[two-layer-ledger-model-contract-vs-movement|双层账本模型：Contract 与 Movement]]
- [[version-chain-modeling-for-amendments|面向 Amendment 的版本链建模]]
- [[whole-database-file-locking-limitation-sqlite-vs-production-postgresql|整个数据库文件锁定的局限性（SQLite 与生产环境 PostgreSQL 要求的对比）]]
