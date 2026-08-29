# Balance Component 核心业务规则

本文件记录跨功能、稳定且必须持续成立的业务不变量。具体 Function 映射、公式和已批准例外仍以 `analysis/` 的现行规格、映射和决策记录为准。

## 业务身份与审计

- LC Number 是根业务身份；适用时 Secondary Reference 标识子合同或关联业务。
- LC Number、Secondary Reference 与 Event Seq 各自独立，共同支持事件识别和追溯。
- Movement ID、referenced transaction 和 compound legs 必须可关联。
- Maker Submit、Checker Release／Reject、Fix Pending 和 Delete Pending 的操作者与时间必须保留。
- 不能为了简化持久化而改变同一个业务事件的身份。

## Maker／Checker

- Maker 与 Checker 必须是不同用户，服务端最终强制执行。
- 只有合法且当前仍可处理的状态才能 Release、Reject、Fix Pending 或 Delete Pending。
- 选取记录与最终动作之间可能发生并发变化；最终动作必须重新验证资格和余额。
- UI 隐藏或禁用按钮不构成安全控制。

## 状态

- 业务生命周期状态不得用于表达内部修订、UI 或持久化技术状态。
- Transaction Status、Balance Status 和 Account Entries Status 必须表达一致的业务阶段。
- Earmarking Function 与 Final-processing Function 的职责必须区分；何时形成或冲销正式分录由批准规则决定。
- Cancelled、Rejected、Released 等事实不能因后续操作而破坏已有审计轨迹。

## Balance 与金额

- 权威金额以 Decimal 处理，并按交易币种的小数位验证。
- 明确区分 face amount、ceiling／exposure amount、Available Balance、Confirmed Balance 和 Tight Available Balance。
- Tolerance、Increase／Decrease、Utilization、Settlement、Redemption、Close 与 Reopen 必须复用 Domain 中的统一公式。
- 会计分录必须按币种借贷平衡；UI 格式化不得改变存储或计算值。
- 余额不足、Full Redeem 等限制必须在服务端执行，不能只依赖前端提示。

## Function 差异

- A1–A11／B1–B7 的共同流程由共享实现承担。
- Tenor、Function eligibility、picker、关联 movement、会计阶段和状态展示的差异由 `function-strategy.ts`、Policy 或 Domain registry 统一表达。
- 新增 Function Code 条件前，先检查是否已有共享策略可以表达该差异。

## Fix Pending 与 Delete Pending

- Fix Pending 修改同一业务事件时应保持其身份与完整审计，不制造对用户可见的技术业务状态。
- Delete Pending 必须遵守所有权、角色、生命周期和 compound event 规则。
- Compound event 的修改或取消必须保持各 leg 一致，并以原子事务完成。
- 新增引用主表的审计表时，必须同步检查数据库清理和 reset 流程的外键删除顺序。

## Expiry、Close 与 Reopen

- Expiry Date 及营业日规则由服务端验证；国内营业日服务不可用时必须产生明确错误。
- Auto Expiry／Auto Close、手动 Close 和 Reopen 必须遵守批准的资格、宽限期、原因码和审计要求。
- Reopen 后恢复哪些余额或状态必须由确定性的 Domain 规则处理，不在 UI 中推导。

## 规则变更

业务规则变化时必须同时检查：

1. `analysis/` 规格和映射。
2. 微服务 Domain／Service／validation。
3. OAS 与类型。
4. Angular Strategy、Policy、显示和输入控制。
5. 单元、API、Business Case 和真实功能测试。
6. `docs/decisions/` 中是否需要新的决策记录。
