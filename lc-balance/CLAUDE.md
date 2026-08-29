# Balance Component

本文件是 `lc-balance` 的仓库级开发入口，只保留跨目录约束。修改某个目录时，还必须遵循距离目标文件最近的 `CLAUDE.md`。

## 工作范围

本仓库只负责 LC Balance Component：

- `microservices/balance-component/`：Balance Component 账本微服务。
- `src/app/transaction-builder/`：Balance Component Angular Maker／Checker UI。
- `src/app/shared/`：跨 Feature 共用的 Angular UI（如 feedback／訊息呈现），可被 transaction-builder 与 business-case-runner 共用。
- `src/app/business-case-runner/` 与 `backend/`：Business Case Runner 和开发用编排服务。
- `microservices/business-days-mock/`：开发／测试用营业日依赖。
- `analysis/`：Balance Component 需求、设计、API 合约和映射资料。

不得把工作扩展到其他组件或仓库。不要修改生成物和运行产物，例如 `coverage/`、`dist/`、压缩包、数据库文件或 `*.generated.ts`，除非任务明确要求。

## 权威来源顺序

资料冲突时按以下顺序判断，并明确记录冲突：

1. Reviewer／BA 最新明确确认的业务决策。
2. `analysis/` 中当前批准的规格和映射。
3. `analysis/balance-component-api.yaml` 与 `analysis/balance-component-channel-api.yaml`。
4. 自动化测试所表达的当前合约。
5. 现有实现。

新确认的长期决策写入 `docs/decisions/`；不要向本文件追加实施日记。历史过程在 `docs/history/implementation-log.md`。

## 不可违反的跨层规则

- 保持 Maker／Checker 四眼控制；授权、角色、状态和 Maker／Checker 分离必须由服务端最终执行。
- 金额计算使用 `decimal.js` 或项目既有 Money 工具，禁止以二进制浮点数执行权威金额计算。
- 保持 LC Number、Secondary Reference、Event Seq、Movement ID、关联交易和审计事实可追溯。
- 同一业务动作的多项持久化修改必须原子成功或原子回滚。
- 业务状态、技术处理状态、修订信息和审计历史必须分离。
- 通用规则实现一次；A1–A11／B1–B7 的差异优先由 Strategy、Policy 或配置表达。
- UI 校验用于体验，服务端／Domain 校验才是权威控制。
- API、类型、实现、测试和相关文档必须同步。
- 规格优先于错误的既有实现；不能通过改写预期结果来掩盖缺陷。

详细规则见 `docs/balance-business-rules.md` 和 `docs/engineering-standards.md`。

## 目录级规则

- Angular Balance UI：`src/app/transaction-builder/CLAUDE.md`
- Balance Component 微服务：`microservices/balance-component/CLAUDE.md`
- Domain：`microservices/balance-component/src/domain/CLAUDE.md`
- 数据库：`microservices/balance-component/src/db/CLAUDE.md`
- 微服务测试：`microservices/balance-component/test/CLAUDE.md`

## 架构速览

开发环境由三个独立 HTTP 进程组成：

- Angular `:4200`
- `backend/` Express 编排服务 `:4300`
- Balance Component Express／TypeScript 微服务 `:4100`

`proxy.conf.json` 将 `/api/*` 转发到 `:4300`，将 `/balance-component/*` 转发到 `:4100`。UI 请求失败或长时间等待时，先确认对应进程是否运行。详细说明见 `docs/architecture.md`。

## 常用命令

首次安装：

```bash
npm install
npm install --prefix backend
npm install --prefix microservices/balance-component
```

启动三个开发进程：

```bash
npm run dev:all
```

Angular：

```bash
npm test
npm run test:coverage
npx tsc -p tsconfig.app.json --noEmit
npm run lint
npm run format:check
npm run build
```

Backend：

```bash
npm test --prefix backend
npm run test:coverage --prefix backend
npm run lint --prefix backend
npm run format:check --prefix backend
```

Balance Component 微服务：

```bash
npm run typecheck --prefix microservices/balance-component
npm test --prefix microservices/balance-component
npm run test:coverage --prefix microservices/balance-component
npm run lint --prefix microservices/balance-component
npm run format:check --prefix microservices/balance-component
npm run build --prefix microservices/balance-component
```

不要让根目录和微服务的 Jest 配置交叉加载。单项测试使用对应项目目录或 `--prefix` 执行。

## 完成标准

根据修改范围执行相应 typecheck、lint、format check、测试、覆盖率和 build。涉及 UI 或集成行为时，还要执行真实 API／浏览器功能验证并检查 Console／Network。

只要相关验证仍失败，就不能宣告完成。仅修改 Markdown 时至少检查结构、链接、重复规则和变更范围，不必运行不受影响的代码测试。

## 文档导航

- 架构：`docs/architecture.md`
- 工程标准：`docs/engineering-standards.md`
- Balance 业务规则：`docs/balance-business-rules.md`
- 决策索引：`docs/decisions/README.md`
- 分析资料索引：`analysis/README.md`
- 历史实施记录：`docs/history/implementation-log.md`
- UI 标准化提案与迁移进度（Message／Feedback／共用样式）：`UI_TODO/README.md`
