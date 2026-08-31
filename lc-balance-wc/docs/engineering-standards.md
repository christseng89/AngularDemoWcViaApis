# Balance Component 工程标准

## 设计前分类

实施前先将需求归类为：通用需求、Domain 规则、Function 特例、工作流、UI 展示或基础设施。先确定唯一责任归属，再修改代码。

当同一需求需要分别修改多个 A／B Function 时，应暂停并检查是否缺少共享 Strategy、Policy、服务或组件。

## 责任边界

- UI 负责展示、输入和交互，不拥有权威 Balance／Exposure 规则。
- Domain 负责确定性业务规则，不依赖 Angular、Express、HTTP 或数据库。
- Service 负责用例编排和事务边界，不应成为 God Service。
- Route 负责 HTTP 适配，不实现业务计算。
- Store 负责持久化，不决定业务状态和资格。
- Function 差异优先由 Strategy／Policy／Registry 表达，避免散落的 Function Code 条件链。

## SOLID 与复杂度

- 每个类、组件、服务和函数应有清晰且单一的变化原因。
- 新 Function 应复用通用流程，只声明真正差异。
- 共享抽象必须保持验证、金额符号、状态、审计和错误合约一致。
- 接口只暴露消费者实际需要的能力。
- 高层工作流依赖稳定抽象，不直接依赖模板、SQL 或底层 HTTP 细节。
- 大文件不是自动拆分理由，但新增不同责任、重复规则或复杂条件链时必须先重构。

## 数据与安全

- 权威金额计算使用 Decimal，明确币种小数位、取整和正负号约定。
- 服务端执行输入验证、权限、Maker／Checker、状态转换、幂等和并发复核。
- 一个业务动作中的多项写入必须处于同一事务，除非批准的业务设计明确允许部分成功并定义补偿。
- 业务错误使用稳定的类型或错误码；不得吞掉异常或依赖脆弱的错误文字匹配。
- 日志保留诊断信息，但 API 不泄漏内部实现细节。

## API 与数据库

- API 行为、OAS、schema、TypeScript 类型、客户端和测试保持同步。
- 不新增未记录的 endpoint 或字段。
- Schema 变化必须通过版本化 migration，不能靠启动时临时 `ALTER TABLE`。
- Migration 必须覆盖空库、历史版本升级、数据保存、约束和重复执行行为。

## 测试策略

按受影响层选择测试：

- Domain：纯函数、边界值、金额和状态转换。
- Service：编排、失败路径、原子性和并发复核。
- Store／DB：约束、migration 和事务。
- API：请求／响应、错误码、幂等和合约。
- UI：状态映射、资格筛选、交互和可访问性。
- Business Case：Import／Export 生命周期回归。

通用规则采用表格驱动测试，至少覆盖代表性 Import、Export、例外 Function 和不适用 Function。

## 完成定义

- 业务与会计语义正确。
- 规则位于正确责任层且没有不必要复制。
- Event identity、审计、幂等、Maker／Checker 和事务语义保持正确。
- 相关 typecheck、lint、format、测试、覆盖率和 build 通过。
- UI／集成变化完成真实浏览器或 API 验证。
- OAS、规格、决策记录和注释已同步。
- 不遗留废弃代码、过时注释或无理由的 suppressions。
