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
- Transaction Index 只是候选清单；Maker Submit/API create 与 Checker Release 必须各自重新解析目标并验证当前资格，不能信任客户端带回的旧状态。
- A6 的来源必须是同 LC、已 acknowledged、仍 PENDING 且尚未 Maker Submit 的 A3／A3S；B4 的来源必须是同 Confirmation、已 RELEASED、未消耗且未被另一笔 pending B4 占用的 B3。

## 状态

- 业务生命周期状态不得用于表达内部修订、UI 或持久化技术状态。
- Transaction Status、Balance Status 和 Account Entries Status 必须表达一致的业务阶段。
- Earmarking Function 与 Final-processing Function 的职责必须区分；何时形成或冲销正式分录由批准规则决定。
- Cancelled、Rejected、Released 等事实不能因后续操作而破坏已有审计轨迹。

## Balance 与金额

- 权威金额以 Decimal 处理，并按交易币种的小数位验证；所有派生金额在币种边界统一采用
  `ROUND_HALF_UP`（四舍五入），例如 JPY 0 位、USD 2 位、KWD 3 位。
- 明确区分 face amount、ceiling／exposure amount、Available Balance、Confirmed Balance 和 Tight Available Balance。
- Tolerance、Increase／Decrease、Utilization、Settlement、Redemption、Close 与 Reopen 必须复用 Domain 中的统一公式。
- A2／B2 金额或 Tolerance 修改必须以修改前后的**整笔合约上限差额**入账：
  `delta = round(newFace × (1 + newTolerance)) - round(oldFace × (1 + oldTolerance))`。
  不得只把本次 Increase／Decrease 金额乘上新 Tolerance。Tolerance 在 Maker Submit／PENDING 阶段只记录在 movement，
  Checker Release 后才更新 contract；Release 时必须依最新已放行基准重算并拒绝 stale amendment。
- A1／B1 `tolerancePct` 与 A2／B2 `toleranceChangePct` 只接受非负整数字符串。
- A2／B2 可只改 Amount、只改 Tolerance，或两者同改。Tolerance-only 以 API `amount: "0"` 表达；
  Request 传 `toleranceChangePct` + `toleranceChangeDirection`；PENDING `tolerancePct` 保持旧核准值，交易本身保存 change。
  Checker Release 后 Movement／Contract `tolerancePct` 才成为后端计算的最终值。
  Amount 为 0 且 Tolerance Change 为 0／未输入的 no-op 由 UI 与微服务共同拒绝。
- MT707 对外表达修证后的最终 Tolerance，不属于 Balance Component API 输入语义；SWIFT／业务编排层必须先以
  当前值换算 change，禁止把 MT707 最终值直接传入 `toleranceChangePct`。
- `AMEND_EXPIRY_DATE` 不接受 Tolerance，也不得改变 Face Amount 或合约 Tolerance。外部 request 金额固定为 0；
  ACTIVE 合约是零金额纯日期修改。EXPIRED 合约由服务端把最后一笔 RELEASED EXPIRE 的金额和反向分录放入
  同一笔 PENDING Amendment，Release 后才恢复 Confirmed／Tight Available Balance；CANCELLED／REJECTED
  尝试不得遮蔽恢复依据，也不得要求用户另做 AMEND_INCREASE。
- 会计分录必须按币种借贷平衡；UI 格式化不得改变存储或计算值。
- 余额不足、Full Redeem 等限制必须在服务端执行，不能只依赖前端提示。
- Tight Available Balance 的操作目标不得小于 0；snapshot 可保留负值作为 over-commit 诊断，
  Business Case Runner 必须自动建立 A02／B02 修复并验证其回到非负。
- A2／B2 Decrease、A3、A8 和 B3 的权威上限是 Tight Available Balance；A3S 的上限是
  `Tight Available Balance + selected SG outstanding`，且 Arrival Amount 必须覆盖所选 SG redemption。
- 上述规则必须在 UI Submit、Maker/API command 和 Checker Release 的适用阶段检查；最终服务端检查不可绕过。

## Function 差异

- 已注册功能 A1、A2、A3、A3S、A4、A6–A11、B1–B7 的共同流程由共享实现承担；A5 不属于现行功能目录。
- Tenor、Function eligibility、picker、关联 movement、会计阶段和状态展示的差异由 `function-strategy.ts`、Policy 或 Domain registry 统一表达。
- 新增 Function Code 条件前，先检查是否已有共享策略可以表达该差异。
- A3S 使用 SG Number／SG Amount，A6 使用 IB Number／IB Amount，B4 使用 EB Number／EB Amount；
  这些 LC + Secondary Reference 必须在同一 Transaction Index row 一次选定。

## Fix Pending 与 Delete Pending

- Fix Pending 修改同一业务事件时应保持其身份与完整审计，不制造对用户可见的技术业务状态。
- Delete Pending 必须遵守所有权、角色、生命周期和 compound event 规则。
- Compound event 的建立／Release 必须使用现有 compound endpoint，在一个事务内完成。
- Delete Pending 目前没有 atomic batch cancel endpoint。A3S／B4 由调用端按策略先取消 sibling legs、最后取消 primary leg；每个 `/cancel` 都独立提交并留下自己的 audit。B5 只取消自己的 Acceptance Settlement。
- A4 Delete Pending 只撤回本次 Maker Submit，使用 `/withdraw-maker-submit`，不得取消作为来源的 A3／A3S movement。
- Transaction Processing 的同 session Delete Pending 与 Maker Queue／Fix Pending 是不同入口；共享 domain policy 与 API client，但不得互相泄漏按钮或导航状态。
- 新增引用主表的审计表时，必须同步检查数据库清理和 reset 流程的外键删除顺序。

## Expiry、Close 与 Reopen

- Expiry Date 及营业日规则由服务端验证；国内营业日服务不可用时必须产生明确错误。
- Auto Expiry／Auto Close、手动 Close 和 Reopen 必须遵守批准的资格、宽限期、原因码和审计要求。
- Reopen 后恢复哪些余额或状态必须由确定性的 Domain 规则处理，不在 UI 中推导。
- EXPIRED Expiry Date Extension 必须以最后一笔 RELEASED movement 判断恢复依据；若为 EXPIRE，Maker Submit
  先产生可供 Checker 审核的 PENDING Account Entries，Release 才恢复余额并转回 ACTIVE。Submit 与 Release
  必须使用同一判断规则。

## 规则变更

业务规则变化时必须同时检查：

1. `analysis/` 规格和映射。
2. 微服务 Domain／Service／validation。
3. OAS 与类型。
4. Angular Strategy、Policy、显示和输入控制。
5. 单元、API、Business Case 和真实功能测试。
6. `docs/decisions/` 中是否需要新的决策记录。

## B3 虛帳與外送會計邊界（現行 Source Code）

- B3 Submit 建立 `EPLC_EXAMINATION/CREATE` 的內部 memo Dr/Cr voucher，供 Maker、Checker 與 Inquiry 顯示及稽核。
- 內部 voucher 儲存在 `contingentAccountEntry`；其狀態隨 B3 顯示為 `EARMARKING`／`EARMARKED`。
- 因 B3 為 `MEMO` exposure，外送會計欄位 `accountEntries` 必須為 `null`。虛帳不送 Accounting，也不需要沖銷。
