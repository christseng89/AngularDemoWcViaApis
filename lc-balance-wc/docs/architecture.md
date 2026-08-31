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
- 交易选择由共享 Index／search／pagination 组件组成，每页 10 笔。A3S、A6、B4 在同一 Index row
  同时选择 LC 与 SG／IB／EB Secondary Reference，并显示对应金额，避免两阶段选择造成错配。
- 尚未选择 Function 时不渲染 Maker、Checker 和 Look Up panels。

### Web Component Phase 1

- `src/web-component.ts` 通过 Angular Elements 幂等注册 `<balance-component-app>`，独立产物由 `npm run build:wc` 生成。
- `src/app/web-component/` 定义版本化、框架中立的配置与 DOM 事件契约，并以组件内部状态切换两个业务视图。
- Web Component 不安装 Angular Router；既有应用继续由 `src/main.ts`、`AppComponent` 和 `app.routes.ts` 驱动。
- 两种入口只共享 `shared-app.providers.ts` 的 HTTP/Formly provider，不改变任何业务服务或 HTTP API 合约。宿主集成说明见 `web-component.md`。

### Web Component Phase 2

- `src/web-component.ts` 的 Custom Element class 提供 `navigate(view)` 与 `refresh()` Promise API，并以元素实例自身的内部 command bridge 呼叫 Angular shell。
- command bridge 不冒泡至宿主；完成状态只通过公开 Promise 与 `balance-*` Custom Events 传递。
- Angular shell 以独立 `ViewContainerRef` 创建／销毁 lazy-loaded view，使 refresh 能重建当前组件，同时保持最后可用 view 直至新 view 成功加载。
- 多个元素实例各自持有 view、loading、render lifecycle 与事件状态；不新增跨实例可变 store。
- Phase 2 不含认证、API base URL、Backend、Microservice 或 OAS 修改。

### Web Component Phase 3

- WC shell 使用 `ViewEncapsulation.ShadowDom`。Angular `SharedStylesHost` 会把 lazy child components 的 Emulated styles 注入该 shadow root。
- WC 从稳定 `main.js` script URL 推导同目录 `styles.css`，在 shadow root 内加载 Bootstrap 与既有 global SCSS；宿主无需且不应全局加载 Balance stylesheet。
- `config.theme` 以 additive、backward-compatible 方式加入 contract version `1`。每个实例独立解析 system/light/dark，并只设置自身 `data-theme`／`data-bs-theme`。
- 宿主仅通过 `--balance-*` design tokens 定制；`.tb-*`、Bootstrap classes 与 Angular scoped attributes 均为私有实现。
- Shadow host 建立独立 stacking context；dialog/overlay 留在该实例内部，public events 仍从 Custom Element host 对外派发。

## Backend Orchestrator

- `backend/server.js` 提供 Business Case Runner 使用的 API。
- `backend/data/businessCases.js` 是声明式案例注册表。
- 此层负责开发／测试场景编排，不是 Balance 业务规则的权威实现位置。
- Run All 的最后三个 seed case 必须保留 A4-ready Sight A3、A6-ready Usance A3 和 B4-ready B3，
  不得为了完成整套案例而继续消费这些人工测试 prerequisite。

## Balance Component 微服务

- `src/app.ts`：Express 应用组合和横切中间件。
- `src/routes/`：请求／响应适配，不拥有 Balance 计算规则。
- `src/service/balanceService.ts`：routes 使用的 compatibility façade、业务用例编排与事务边界。
- `src/service/*Service.ts`：Query、Snapshot、Contract resolution、Request validation、Release policy／side
  effects、Lifecycle eligibility／sweep 等单一职责协作者；责任表见该目录的 `README.md`。
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

# Phase 4 framework adapters

Angular, React and Vue integrations are deliberately one-way thin ports over the versioned native
element contract. `adapter-core.ts` centralizes property assignment, typed event subscription and
method forwarding. No adapter may import transaction-builder domain services. React and Vue are
host-provided runtimes and therefore cannot increase the core WC runtime dependency graph.

# Phase 5 release boundary

The distributable is a single package with independent subpath exports for WC assets, the versioned
contract and each adapter. A generated asset manifest makes the un-hashed WC output reproducible and
auditable. Browser E2E uses real framework runtimes only in dev fixtures. Optional peer declarations
prevent Angular, React or Vue from becoming core WC runtime dependencies.
