# Balance Component 微服务开发规则

本目录是 Balance 业务规则和持久化行为的权威服务端实现。根 `CLAUDE.md` 和更深目录的局部规则同时适用。

## 分层

- `src/routes/`：HTTP 输入输出适配。
- `src/validation/`：请求结构和边界验证。
- `src/service/`：用例、事务和跨 Domain／Store 编排。
- `src/domain/`：确定性的业务规则。
- `src/store/`：SQL 持久化访问。
- `src/db/`：连接、schema 和 migrations。

业务计算不能放在 Route 或 Store；HTTP／SQL 细节不能进入 Domain。

## 服务端权威控制

- 校验金额、币种小数位、自然键、合法状态转换、eligibility、幂等和 Maker／Checker 分离。
- 在最终写入前重新检查依赖余额或状态，不能信任 UI 选择时的旧结果。
- Compound movement、状态加审计写入等业务原子操作使用数据库事务。
- 使用现有 typed error 和稳定错误码；不得泄漏堆栈、SQL 或内部路径。

## 合约

Endpoint、字段、状态、错误或语义变化时同步：

- `analysis/balance-component-api.yaml`
- 必要时 `analysis/balance-component-channel-api.yaml`
- `src/types.ts`、validation 和客户端类型
- API／Service／Domain 测试
- 相关业务规格和决策记录

## 金额和会计

- 使用 `decimal.js` 和 `src/money.ts` 的既有入口。
- 禁止以 JavaScript `number` 执行权威金额运算。
- 保持币种一致、明确取整、符号约定和 Debit＝Credit。
- Face amount、ceiling、exposure 和各类可用余额必须明确区分。

## 验证

```bash
npm run typecheck
npm test
npm run test:coverage
npm run lint
npm run format:check
npm run build
```

在本目录运行命令，避免加载根 Angular Jest 配置。API 或数据库行为变化时，增加相应集成／migration 验证；涉及完整业务流程时同步运行代表性 Business Case。
