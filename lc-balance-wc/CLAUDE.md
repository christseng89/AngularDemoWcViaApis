# Balance Component

本文件是 `lc-balance-wc` 的仓库级开发入口，只保留跨目录约束。修改某个目录时，还必须遵循距离目标文件最近的 `CLAUDE.md`。

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
4. `openspec/specs/` 中已经验证并归档的当前行为合约。
5. 自动化测试所表达的当前合约。
6. 现有实现。

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

## SWIFT Expert Certification Gate

凡涉及 SWIFT 报文、字段、格式、代码字或 Trade Finance 业务语义的修改，必须按 SWIFT 专家级标准完成跨层认证检查：确认适用规则、字段格式、边界条件、API 校验、Angular 校验、持久化结果、Business Case Runner 案例及文档彼此一致。不得仅凭 UI 限制取代服务端权威校验，也不得把推测写成 SWIFT 规则；若权威资料与现有实现冲突，必须记录并升级确认。

- Balance Component 与 MT7xx 系列的整合属于高风险认证范围；LC 开立、修改、保兑及相关交易的字段映射或余额效果变更，必须逐项完成上述检查。
- 边界必须明确：MT707 对外字段表达修证后最终有效 Tolerance；这不是 Balance Component API 的字段语义。SWIFT／业务编排层必须以当前值计算 change，再传入 Balance Component 的 `toleranceChangePct` 与 `toleranceChangeDirection`，不得把 MT707 最终值直接当作 change。
- A1／B1 的初始 `tolerancePct` 只接受非负整数字符串。
- A2／B2 只接受非负整数的 `toleranceChangePct`；`tolerancePct` 是后端计算并保护的 Resulting Tolerance，不是 Amendment 输入字段。
- Decrease 后的 Resulting Tolerance 可等于 0，但不得小于 0；Angular 与 API 必须使用相同规则直接拒绝。
- Amendment Release 不接受也不重传最终 `tolerancePct`；服务端必须从已保存的 change 与当前核准 Contract 自行重算、检查 stale basis，并仅在 Release 成功后激活最终值。
- 每项 SWIFT 相关变更必须有正向、边界及拒绝案例，并纳入相关单元／整合测试与 Business Case Runner。

## OpenSpec Professional Verification Gate（项目级）

本节是本项目自定义的专业验证门槛，不代表 OpenSpec 官方颁发的个人或产品认证。正式 OpenSpec artifacts 位于 repository 根目录 `openspec/`；不得在 `docs/` 建立第二份 OpenSpec truth。

- `openspec/specs/` 只描述已经由 Source Code、自动化测试及 OAS 证实的可观察 AS-IS 行为；尚未实现的目标架构、SBLC／LG 或其他未来行为必须留在 `openspec/changes/`。
- 任何新增、修改或删除行为必须先建立 change proposal 与 delta spec；复杂跨层变更还必须包含 design 和可验证 tasks，未经同意不得直接实施。
- 每项规范性 Requirement 必须使用 SHALL／MUST，并至少包含一个可测试的 WHEN／THEN scenario；金额、状态、权限或边界规则还必须包含适用的拒绝／边界 scenario。
- 验证必须覆盖受影响的 Angular、API、Domain、DB、Maker／Checker、accounting、Business Case Runner、OAS、Obsidian 与 OpenSpec。不得只验证 UI，也不得以改写 spec 或 expected result 掩盖缺陷。
- OpenSpec 与较高权威来源冲突时，依本文件的“权威来源顺序”处理，记录冲突并同步修正；不得让未经验证的 spec 静默覆盖业务决策或 OAS。
- Archive 前必须逐项对照 implementation、测试结果与 delta scenarios；只有 implementation、全部 tasks、artifacts 与受影响验证均完成，且 strict validation 通过，才可执行 `openspec archive <change-name> --yes`。不得建立空 change 或把未完成 change 归档来伪造 archive evidence。
- Archive 命令必须让 delta specs 合并到 current specs，并把完整 change 保存在 `openspec/changes/archive/YYYY-MM-DD-<change-name>/`；归档后必须再次执行 strict validation、确认 current specs 已同步，并保留 proposal、design、tasks、delta specs 与验证证据作为 audit trail。
- 本项目 OpenSpec artifacts 与生成的 `/opsx:*`、`$openspec-*` workflows 固定使用官方 `@fission-ai/openspec@1.12.0`。新环境必须执行 `npm install --global @fission-ai/openspec@1.12.0`，并以 `openspec --version` 确认输出 `1.12.0`；不得安装 npm 上无关的 `openspec` placeholder package。
- OpenSpec CLI 严格验证命令为 `openspec validate --all --strict --no-interactive`。Claude Code 使用 `/opsx:*` workflows；Codex 使用 `$openspec-*` skills。CI／新贡献者环境必须先完成上述版本检查，不能依赖未记录的机器全局状态。

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
- 现行行为基准：`docs/current-behavior.md`
- 决策索引：`docs/decisions/README.md`
- 分析资料索引：`analysis/README.md`
- 历史实施记录：`docs/history/implementation-log.md`
- UI 标准化提案与迁移进度（Message／Feedback／共用样式）：`UI_TODO/README.md`
