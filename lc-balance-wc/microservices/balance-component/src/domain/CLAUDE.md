# Balance Domain 开发规则

本目录只包含可独立验证的 Trade Finance、Balance、Exposure、Eligibility、状态和会计规则。

## 纯 Domain 边界

- Domain 不依赖 Angular、Express、HTTP、SQLite、Store 或运行时 UI 状态。
- 规则优先实现为确定性纯函数、Policy 或小型 Domain service。
- 输入和输出使用明确类型；不要依赖共享可变状态。
- 业务术语必须与批准规格一致，不能为了技术方便发明新业务概念或状态。

## 现有责任

- `balanceDerivation.ts`：余额推导。
- `tolerance.ts`：Tolerance 与 ceiling。
- `statusTransition.ts`：合法状态转换。
- `closeEligibility.ts`／`expiryEligibility.ts`：Close／Expiry 资格。
- `offBalanceExposure.ts`／`contingentAccountEntry.ts`：或有负债和分录语义。
- `tenorRouting.ts`：Tenor 路由。
- `domesticCalendar.ts`／`autoCloseGracePeriod.ts`：营业日和宽限期规则。

新增规则前先确认现有文件是否已拥有该责任，避免产生第二套公式或映射。

## 不变量

- 金额使用 Decimal，边界、零值、负值、Tolerance 和币种精度必须明确测试。
- 状态转换必须拒绝非法来源状态，并保持审计和幂等语义。
- Import／Export 共享规则实现一次；真实差异通过参数、Policy 或 registry 表达。
- 业务结果不得依赖调用顺序、当前时间或外部服务，除非这些依赖以参数明确注入。

## 测试

每项 Domain 变更至少覆盖：正常路径、边界值、非法输入、状态例外，以及受影响的代表性 Import／Export 场景。测试放在 `test/unit/domain/`，按源文件责任命名。
