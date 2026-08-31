# Balance 数据库开发规则

本目录管理 Node `node:sqlite` 数据库、schema 和版本化 migrations。

## Schema 变更

- 所有持久化 schema 变更通过 `migrations.ts` 的版本化 migration 完成。
- 不在应用启动路径执行无版本控制的临时 `ALTER TABLE`。
- 约束优先在数据库层表达：唯一键、外键、CHECK、NOT NULL 和必要索引。
- 新增或修改索引前说明查询模式和写入成本。

## Migration 安全

每个 migration 都要验证：

- 新空库创建。
- 从受支持的历史 schema 升级。
- 现有数据保持正确。
- 外键与 CHECK 约束仍生效。
- 重建表时字段、默认值、索引和审计数据没有丢失。
- 重复启动不会再次破坏性执行。

不要为确认从未部署过的历史状态编写虚构 backfill。若确实需要 backfill，必须有明确来源数据、转换规则和回滚／失败策略。

## 事务与清理

- 一个业务动作的关联写入由 Service 建立事务边界。
- 新增外键表时检查所有 reset、cleanup 和测试 fixture 的删除顺序。
- 不以关闭外键约束作为正常业务解决方案。
- SQLite 文件级锁是当前技术限制，不代表生产并发设计已经满足要求。

## 测试

相关测试位于 `test/unit/db/`。Schema 或 migration 变化必须运行 DB 测试、完整微服务测试、coverage、typecheck 和 build。
