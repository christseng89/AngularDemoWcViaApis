# Balance Component 架构

## 系统边界

`lc-balance` 是由三个独立 HTTP 进程组成的 Balance Component 开发工作区，不是单体应用：

```text
Angular UI (:4200)
├── /api/*                 → Backend Orchestrator (:4300)
└── /balance-component/*   → Balance Microservice (:4100)

Backend Orchestrator (:4300)
└── 按 Business Case Registry 编排微服务调用

Balance Microservice (:4100)
├── routes/       HTTP 边界
├── service/      用例编排
├── domain/       纯业务规则
├── store/        持久化访问
└── db/           SQLite schema、连接和 migration
```

## Angular 应用

- `src/app/transaction-builder/`：逐笔 Maker／Checker 交易、查询、Fix Pending 和 Delete Pending。
- `src/app/business-case-runner/`：通过 `backend/` 执行整套 Import／Export Business Case。
- Transaction Builder 的父组件负责协调状态和子功能，不应重新累积领域、HTTP、分页和复杂显示逻辑。

## Backend Orchestrator

- `backend/server.js` 提供 Business Case Runner 使用的 API。
- `backend/data/businessCases.js` 是声明式案例注册表。
- 此层负责开发／测试场景编排，不是 Balance 业务规则的权威实现位置。

## Balance Component 微服务

- `src/app.ts`：Express 应用组合和横切中间件。
- `src/routes/`：请求／响应适配，不拥有 Balance 计算规则。
- `src/service/balanceService.ts`：业务用例编排与事务边界。
- `src/domain/`：Balance、Tolerance、Eligibility、状态转换及会计语义。
- `src/store/`：唯一 SQL 持久化访问层。
- `src/db/`：Node `node:sqlite`、schema 和版本化 migrations。

SQLite 适合当前开发和验证，但其文件级锁不能代表生产环境的逐笔工具并发控制。生产设计需要 PostgreSQL 等支持行级锁和成熟事务隔离的数据库。

## 营业日历生成

`src/app/transaction-builder/domestic-holidays.generated.ts` 与
`microservices/balance-component/src/domain/domesticHolidays.generated.ts` 由
`scripts/generate-domestic-calendar.mjs` 从 `microservices/business-days-mock/data/calendar.json`
生成，是 Angular 与微服务共享的营业日历唯一来源；两端 `pretest`／`prebuild` 会自动重新生成。不要手改
这两个 `*.generated.ts` 文件，修改营业日历请改 `calendar.json` 后重新生成（`npm run generate:calendar`）。

## 合约与资料

- `analysis/balance-component-api.yaml`：Balance 微服务 API。
- `analysis/balance-component-channel-api.yaml`：Web／Mobile Channel API。
- `analysis/TF_Balance_Component_Spec-{en,zh}.docx`：基础业务规格。
- `analysis/TF_Contingent_Liability_Lifecycle-{en,zh}.docx`：或有负债生命周期。
- `analysis/TF_Balance_Component_Mapping-{en,zh}.xlsx`：功能和字段映射。
- `analysis/contingent-liability-ledger.html`：会计分录参考。

完整索引及维护方式见 `../analysis/README.md`。

## 变更影响链

业务行为变化时，按需同步：

```text
业务决策／规格
  → Domain 与 Service
  → API schema／类型
  → Store／DB（如涉及持久化）
  → Angular／Backend 客户端
  → 单元、合约、案例和真实功能验证
  → OAS、决策记录及相关文档
```
