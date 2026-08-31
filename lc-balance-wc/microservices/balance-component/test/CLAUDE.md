# Balance Component 测试规则

本目录验证微服务的 Domain、Service、API、Store、DB 和完整业务案例。

## 组织方式

- `unit/domain/`：纯业务规则和边界值。
- `unit/service/`：用例编排、失败路径和事务结果。
- `unit/db/`：schema、约束、migration 和数据保存。
- `unit/store/`：持久化行为和审计记录。
- `unit/validation/`：请求 schema。
- `unit/caseWalkthroughs.test.ts`：跨层 Business Case 生命周期。

测试应遵循生产责任边界；不要通过大量内部可变状态断言来绕过公开行为。

## 测试设计

- 每个缺陷先建立能复现问题的回归测试。
- Common Requirement 使用 `test.each` 等表格驱动方式，覆盖代表性 Import、Export、例外和不适用 Function。
- 金额规则覆盖币种小数位、零、负值、边界、Tolerance 和 0.01 差异。
- 状态规则覆盖合法转换、非法转换、重复请求和并发前状态变化。
- Migration fixture 必须代表真实支持的历史 schema，不能只针对当前实现伪造。
- 不降低断言质量或修改业务预期来让现有实现通过。

## 命令

在 `microservices/balance-component/` 中运行：

```bash
npm run typecheck
npm test
npm run test:coverage
npm run lint
npm run format:check
npm run build
```

单项测试：

```bash
npm test -- path/to/file.test.ts
```

项目覆盖率门禁为 statements、branches、functions、lines 均至少 95%。不要跨目录使用 Angular 的 Jest 配置。
