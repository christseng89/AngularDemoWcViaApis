---
knowledge_id: angular-checker-panel-actions-test-scenarios
title: "Angular Checker 面板 + 操作 测试场景"
domain: Balance
category: Test Scenarios
snapshot_date: 2026-08-22
tags:
  - balance
  - test-scenario
---

# Angular Checker 面板 + 操作 测试场景

从本主题范围的测试文件中提取了19个测试场景。这些场景所证明的规则详见 Angular Checker Panel + Actions 与 [[Business-Rule-Index]]。

| 场景 | 前置条件（Given） | 触发操作（When） | 预期结果（Then） | 来源 |
|---|---|---|---|---|
| Checker Queue 在 resetTrigger 时重置，但 checkerLcNumber 会保留 | 一个 CheckerPanelComponent，已解析出合约、条目、选中项，以及过期的次要候选项和提示信息 | ngOnChanges 在首次变更时因 resetTrigger 触发，随后在后续（非首次）变更时再次触发 | 首次变更不产生任何效果（所有状态均不受影响）；后续变更会清空 checkerContract/checkerSearchError/checkerItems/selectedCheckerMovement/checkerSecondaryCandidates/checkerAutoPickedHint，但保留 checkerLcNumber 不变，使 Checker 可以在切换到新功能后继续针对同一份 LC 进行检查 | `checker-panel.component.spec.ts:135-157` |
| 只有在合约已经解析完成的情况下，queueRefreshTrigger 才会原地重新加载队列 | checkerContract 已解析为 bc-9，checkerLcNumber='S001' | ngOnChanges 在后续（非首次）变更时因 queueRefreshTrigger 触发 | 调用 listMovements('bc-9')，且 checkerLcNumber 保持为 'S001'——搜索状态本身被保留，这与 resetTrigger 的完全重置不同 | `checker-panel.component.spec.ts:159-172` |
| 在没有已解析合约的情况下，queueRefreshTrigger 不产生任何效果 | checkerContract 为 null | queueRefreshTrigger 在后续变更时触发 | listMovements 从未被调用——没有可重新加载的内容 | `checker-panel.component.spec.ts:174-182` |
| 空白的次要参考号会转为仅按 LC 浏览候选项，而不是阻断性报错 | selectedFunction=A7（IPLC_ACCEPTANCE，需要 ibNumber），checkerLcNumber='LC1'，checkerSecondaryRef='' | 运行 searchCheckerLc() | 调用的是 catalog('IPLC_ACCEPTANCE','ACTIVE',undefined,1,100,'LC1')（而非 resolveContract）——旧版硬性报错 'Type a IB/SG Number to search' 不再触发 | `checker-panel.component.spec.ts:274-285` |
| 仅按 LC 查找候选项为零条时，会产生真实可见的报错 | selectedFunction=A9（SHGT），checkerLcNumber='LC1'，catalog() 返回 0 条记录 | 运行 searchCheckerLc() | checkerSearchError = 'No SG Number record found under this LC.'；checkerContract 保持为 null；checkerSecondaryCandidates 保持为空 | `checker-panel.component.spec.ts:352-363` |
| 仅按 LC 查找到恰好一条候选项时会自动解析并加载其队列，不产生额外的往返请求 | selectedFunction=A9，catalog() 恰好返回一份 SHGT 合约（sgNumber='G01'），带有一笔 PENDING 状态的 FULL_REDEEM 动账 | 运行 searchCheckerLc() | resolveContract() 从未被调用；checkerContract 解析为该合约；checkerSecondaryRef 变为 'G01'；checkerAutoPickedHint = 'Only one SG Number under this LC — picked automatically.'；checkerItems 已经通过 loadCheckerQueue() 包含了该 PENDING 状态的赎回记录 | `checker-panel.component.spec.ts:365-383` |
| 仅按 LC 查找到多条候选项时会展示手动选择列表 | selectedFunction=A9，catalog() 在同一份 LC 下返回两份 SHGT 合约（G01、G02） | 运行 searchCheckerLc() | checkerSecondaryCandidates=[G01,G02]；checkerContract 保持为 null；checkerAutoPickedHint 保持为 null；listMovements 尚未被调用 | `checker-panel.component.spec.ts:385-399` |
| A3 自身的 Checker Queue 会隐藏其 Checker 已确认（acknowledged）过的条目 | selectedFunction=A3，合约上有两笔 PENDING 状态的 UTILIZE——一笔 acknowledgedAt=null，一笔 acknowledgedAt 已设置 | 运行 loadCheckerQueue() | checkerItems 中只保留未确认的那笔 UTILIZE——已确认的那笔会从 A3 自身界面上隐藏 | `checker-panel.component.spec.ts:496-512` |
| 一旦既已确认（acknowledged）又已 Maker 提交（Maker-Submitted），A4 自身的 Checker Queue 仍能找到 A3 隐藏的那条记录 | selectedFunction=A4，一笔 PENDING 状态的 UTILIZE，acknowledgedAt 与 makerSubmittedAt 均已设置 | 运行 loadCheckerQueue() | 该条目确实被包含在 A4 的 checkerItems 中——这一排除逻辑仅作用于 deferSettlement 类功能，而非共享的队列组件本身 | `checker-panel.component.spec.ts:518-541` |
| A4 自身的 Checker Queue 会排除尚未 Maker 提交的 EARMARKED 条目 | selectedFunction=A4，一笔 PENDING 状态的 UTILIZE，acknowledgedAt 已设置但 makerSubmittedAt=null | 运行 loadCheckerQueue() | checkerItems 为空——这与 release() 自身在服务端针对未经 Maker 提交的 Sight UTILIZE 返回的 409（BAL-123）保持一致，客户端也提前做了同样的强制校验 | `checker-panel.component.spec.ts:547-569` |
| A4 自身的 Checker Queue 会排除仍处于 EARMARKING 状态的条目（真正的四眼原则场景） | selectedFunction=A4，两笔 PENDING 状态的 UTILIZE 均已设置 makerSubmittedAt——一笔 acknowledgedAt=null，一笔 acknowledgedAt 已设置 | 运行 loadCheckerQueue() | 只有已确认的那笔会被包含——尚未确认的那笔即使已经 Maker 提交，也会从 A4 自身的队列中排除 | `checker-panel.component.spec.ts:575-597` |
| A2 自身的 Checker Queue 永远不会展示同一份共享 IPLC_LC 合约上与之无关的 A3 UTILIZE 记录 | selectedFunction=A2，合约上有一笔 PENDING 状态的 AMEND_INCREASE 和一笔 PENDING 状态的 UTILIZE | 运行 loadCheckerQueue() | 只有 AMEND_INCREASE 会被包含——UTILIZE（A2 自身不可能产生的 movementType）会被 movementTypeMatchesFunction 过滤掉 | `checker-panel.component.spec.ts:603-619` |
| A3S release 快速路径：已知 arrivalSgRedeemMovementId 时跳过 businessEventId 查找 | selectedFunction=A3S，arrivalSgRedeemMovementId='sg-redeem-1' 已知 | 调用 release(ctx) | 直接调用 api.release('sg-redeem-1','checker1')，findByBusinessEventId 从未被调用，结果为 {kind:'documentArrivalAcknowledged'} | `checker-actions.service.spec.ts:63-78` |
| A3S release 的跨会话回退方案通过 businessEventId 解析出 SG 赎回记录 | selectedFunction=A3S，arrivalSgRedeemMovementId=null，selectedCheckerMovement 携带 businessEventId='be-2'；findByBusinessEventId 返回一笔 FULL_REDEEM 以及该 LC 自身共享同一 id 的 UTILIZE | 调用 release(ctx) | 调用 findByBusinessEventId('be-2')，FULL_REDEEM 分支被释放，结果为 {kind:'documentArrivalAcknowledged'} | `checker-actions.service.spec.ts:80-99` |
| A3S release 不会把已经 RELEASED 的兄弟动账误认为仍处于 PENDING 状态的赎回记录 | 唯一共享该 businessEventId 的动账是一笔 status='RELEASED' 的 ISSUE | 针对 A3S 调用 release(ctx) | 结果为 {kind:'failed'}，报错信息包含 'Could not find the matched Shipping Guarantee redemption'；api.release 从未被调用 | `checker-actions.service.spec.ts:114-126` |
| B4 Sight/HONOUR 跨会话解析出 Due from Issuing Bank 分支，且不会重复释放已释放的 B3 来源记录 | selectedFunction=B4，dueFromIssuingBankMovementId=null，selectedCheckerMovement 是携带 businessEventId='be-b4s' 的 HONOUR；findByBusinessEventId 返回该 HONOUR 本身以及一笔关联的 CREATE | 调用 release(ctx) | 调用 findByBusinessEventId；恰好发生 2 次 api.release() 调用——先是 HONOUR（主记录），再是 Due-from-Issuing-Bank 的 CREATE——B3 来源记录从未被重复释放 | `checker-actions.service.spec.ts:256-278` |
| B4 Usance/ACCEPT 按关联 CREATE 的创建顺序解析出两条下游分支 | selectedFunction=B4，acceptanceMovementId=null，acceptanceReimbReceivableMovementId=null；findByBusinessEventId 按创建顺序返回该 ACCEPT 以及 2 笔 CREATE（先是 liability，再是 receivable） | 调用 release(ctx) | 依次发生 3 次 api.release() 调用：先是 ACCEPT 主记录，再是第一笔 CREATE（liability），最后是第二笔 CREATE（receivable） | `checker-actions.service.spec.ts:299-323` |
| reject() 优先使用 selectedCheckerMovement，而非过期的 submitResult | ctx.submitResult.movementId='stale-mv'，ctx.selectedCheckerMovement.movementId='fresh-mv' | 调用 reject(ctx) | 调用的是 api.reject('fresh-mv','checker1','MANUAL_TEST_REJECT')，而不是 'stale-mv' | `checker-actions.service.spec.ts:410-424` |
| 在没有 createdBy 的情况下，deleteMakerPending() 会干净地失败，且不会触碰 API | ctx.createdBy=null，ctx.submitResult.movementId='mv-1' 存在 | 调用 deleteMakerPending(ctx) | 结果为 {kind:'failed'}，包含 'no Maker (createdBy) is known'；api.cancel 从未被调用（BAL-132 运行时防护） | `checker-actions.service.spec.ts:440-451` |
