# Transaction Builder 开发规则

本目录负责 Balance Component 的 Angular Maker／Checker、查询、Fix Pending 和 Delete Pending UI。根 `CLAUDE.md` 的跨层规则继续适用。

## 责任边界

- Component 负责展示、用户输入和协调，不实现权威 Balance／Exposure 规则。
- HTTP 调用放在 API／workflow service；分页、picker、lookup 和 checker action 使用已有专用服务。
- 跨 Function 的差异优先配置在 `function-strategy.ts`、`function-policy.ts`、`builder-fields.ts` 或 `submit-rules.ts`。
- 不要把已提取的职责重新放回 `transaction-builder.component.ts`。
- 可重复 UI 使用子组件；复杂推导优先使用可单测的纯函数或服务。

## Function 与导航

- A1／B1 等创建根合同的流程与选择既有合同的流程必须明确区分。
- 选中 LC／Secondary Reference／Event 后应保留上下文，避免无业务理由的重复选择。
- Fix Pending、Delete Pending、Maker Queue、Checker Queue 和 Inquire 页面必须保持同一 Event identity。
- Function 差异不得以散落在模板和组件中的 Function Code 条件链表达。

## 校验与安全

- 前端即时校验和错误提示用于用户体验，不能替代服务端验证。
- 系统控制字段保持只读，不能通过请求 payload 覆盖。
- 所有异步状态必须提供 loading、error 和 empty state；适用时维护 `aria-live`、`aria-busy` 和 `aria-describedby`。
- 金额输入和显示遵循币种小数位，但权威取整和金额判断仍由服务端执行。

## 状态和会计显示

- 状态映射使用共享映射／策略，不在多个模板重复。
- Transaction Status、Balance Status 和 Account Entries Status 必须语义一致。
- Compound event 在业务要求为单一事件时，列表和详情不得重复显示多行技术 legs。
- Voucher／Account Entries 展示必须反映当前 Function 的会计阶段和批准规则。

## 测试与验证

```bash
npm test
npm run test:coverage
npx tsc -p tsconfig.app.json --noEmit
npm run lint
npm run format:check
npm run build
```

- 共享逻辑使用参数化测试覆盖代表性 Import、Export、例外和不适用 Function。
- 模板可见性、真实 DOM 路径、跨进程请求或浏览器 session 行为变化时，必须执行真实浏览器验证。
- 验证 Console、Network、loading、empty、error、分页、主题和基本可访问性。
