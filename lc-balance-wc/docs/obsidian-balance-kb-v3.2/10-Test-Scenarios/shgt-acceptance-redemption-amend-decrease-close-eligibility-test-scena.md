---
knowledge_id: shgt-acceptance-redemption-amend-decrease-close-eligibility-test-scena
title: "SHGT/Acceptance 赎回、Amend Decrease、Close 资格 测试场景"
domain: Balance
category: Test Scenarios
snapshot_date: 2026-08-22
tags:
  - balance
  - test-scenario
---

# SHGT/Acceptance 赎回、Amend Decrease、Close 资格 测试场景

从本主题范围的测试文件中提取了14个测试场景。这些场景所证明的规则详见 [[Close Eligibility|SHGT/Acceptance 赎回、Amend Decrease、Close 资格]] 与 [[Business-Rule-Index]]。

| 场景 | 前置条件（Given） | 触发操作（When） | 预期结果（Then） | 来源 |
|---|---|---|---|---|
| A10 顺利路径——全额核销并终止 | 一份 IPLC_LC 已 Issue 并 Release，Confirmed Balance 为 10000，没有 SG/Acceptance 子级。 | Maker 提交 amount 为 10000 的 CLOSE；Checker 将其释放。 | 动账状态变为 RELEASED；合约的 Confirmed Balance 变为 0；ContractStatus 变为 CLOSED；该 LC 不再能通过仅限 ACTIVE 的自然键查找解析出来。——*余额影响：* Confirmed Balance：10000 -> 0（全额核销）。 | `microservices/balance-component/test/unit/service/closeFunction.test.ts lines 47-72` |
| A10 被阻止——SG 余额非零 | 一份 LC 有一笔已 Released、金额 2000 的 SHGT ISSUE（从未被赎回）。 | Maker 尝试提交 CLOSE。 | createMovement() 抛出 InsufficientBalanceError，引用 'Shipping Guarantee Balance must be 0'。——*余额影响：* 未创建任何动账；Confirmed Balance 不变。 | `microservices/balance-component/test/unit/service/closeFunction.test.ts lines 74-101` |
| A10 被阻止——合约树中其他位置仍存在 PENDING 事件 | 一份 LC 有一笔已创建但从未释放（仍为 PENDING）的 SHGT ISSUE；该 SG 自身对 Confirmed 的贡献仍为 0。 | Maker 尝试提交 CLOSE。 | 抛出 InsufficientBalanceError，报错信息包含 'not yet fully resolved'。——*余额影响：* N/A——在创建任何动账之前即被拒绝。 | `microservices/balance-component/test/unit/service/closeFunction.test.ts lines 103-135` |
| A10 被阻止——根级 LC 自身存在 PENDING 事件 | 一份 LC 有一笔未释放、仍为 PENDING 的 500 AMEND_INCREASE。 | Maker 尝试提交 CLOSE。 | 抛出 InsufficientBalanceError。——*余额影响：* N/A——在创建任何动账之前即被拒绝。 | `microservices/balance-component/test/unit/service/closeFunction.test.ts lines 137-163` |
| A10 被阻止——提交的金额与 Confirmed Balance 不完全相等 | 一份 Confirmed Balance 为 10000 的 LC。 | Maker 提交 amount 为 9999 的 CLOSE。 | 抛出 InsufficientBalanceError，包含 'must exactly equal the current Confirmed Balance'。——*余额影响：* N/A——在创建任何动账之前即被拒绝。 | `microservices/balance-component/test/unit/service/closeFunction.test.ts lines 165-185` |
| A10 释放时点漂移——Confirmed Balance 在 Submit 与 Approve 之间发生变化 | 已提交的 CLOSE（仍为 PENDING），其 ceilingAmount 冻结为 10000，在 Submit 时是正确的。 | 在该 CLOSE 动账自身被释放之前，另一笔 3000 的 AMEND_INCREASE 被提交并释放，将 Confirmed Balance 拉高至 13000。 | 尝试释放原始的 CLOSE 会抛出 IllegalStateTransitionError。——*余额影响：* 过期的 CLOSE 从未核销余额；Maker 必须取消并以当前数字重新提交。 | `microservices/balance-component/test/unit/service/closeFunction.test.ts lines 187-222` |
| A10 被阻止——已处于 CLOSED 状态（通过 balanceContractId 查找的释放路径重新校验） | 一份已通过此前成功的 CLOSE release 而变为 CLOSED 状态的 LC。 | 直接通过 balanceContractId 尝试第二次 CLOSE createMovement（绕过仅限 ACTIVE 的自然键解析）。 | 抛出 InsufficientBalanceError，包含 'already been Closed'。——*余额影响：* N/A——在创建任何动账之前即被拒绝。 | `microservices/balance-component/test/unit/service/closeFunction.test.ts lines 224-255` |
| A10 锁定——已 Closed 的 LC 上不能再执行任何其他功能 | 一份通过已释放的 CLOSE 动账变为 CLOSED 状态的 LC。 | 通过自然键查找尝试针对其发起 AMEND_INCREASE。 | createMovement() 抛出 NotFoundError——该 LC 不再能作为 ACTIVE 状态被解析。——*余额影响：* N/A。 | `microservices/balance-component/test/unit/service/closeFunction.test.ts lines 257-283` |
| A10 被拒绝——针对非根级 instrumentType 尝试 Close | 一份 SHGT（子级）合约，已 Released，未结清金额为 2000。 | 直接针对该 SHGT 自身的 balanceContractId 尝试 CLOSE。 | 抛出 InsufficientBalanceError（ROOT_INSTRUMENT_TYPES 校验拒绝将 SHGT 作为 Close 目标）。——*余额影响：* N/A。 | `microservices/balance-component/test/unit/service/closeFunction.test.ts lines 285-316` |
| B6 顺利路径——Close 之前 Present Docs 已全部完成兑付 | 一份金额 10000 的 EPLC_CONFIRMATION 已 Issue；一笔 Examination CREATE 已释放，随后被全额 HONOUR（引用该 Examination），使 Confirmed Balance 已为 0。 | Maker 提交 amount 为 0 的 CLOSE；Checker 将其释放。 | 动账为 RELEASED；Confirmed Balance 保持为 0。——*余额影响：* 无需进一步核销——在 Close 之前 Confirmed Balance 已经为 0。 | `microservices/balance-component/test/unit/service/closeFunction.test.ts lines 320-363` |
| B6 被阻止——已 RELEASED 但尚未被消耗的 Present Docs 提示单据 | 一份 EPLC_CONFIRMATION 有一笔已 RELEASED（经 B3 Checker 批准）但尚未被任何 B4 HONOUR/ACCEPT 消耗的 Examination CREATE。 | Maker 尝试提交 CLOSE。 | 抛出 InsufficientBalanceError，包含 'not yet fully resolved'，即便该 Examination 记录并非 PENDING 状态。——*余额影响：* N/A——在创建任何动账之前即被拒绝。 | `microservices/balance-component/test/unit/service/closeFunction.test.ts lines 365-399` |
| B6 被阻止——Acceptance 余额非零 | 一份 EPLC_CONFIRMATION 有一笔已释放、金额 3000、未结清的 EPLC_ACCEPTANCE CREATE。 | Maker 尝试提交 CLOSE。 | 抛出 InsufficientBalanceError，包含 'Acceptance Balance must be 0'。——*余额影响：* N/A。 | `microservices/balance-component/test/unit/service/closeFunction.test.ts lines 401-435` |
| 第一步选择器提示——只返回真正符合资格的 ACTIVE 根级合约 | 三份 IPLC_LC：一份完全符合资格，一份 SG 余额非零（不符合资格），一份已经 CLOSED。 | 调用 listCloseEligibleContracts('IPLC_LC')。 | 只返回符合资格的那份 LC；total = 1。——*余额影响：* N/A——只读的提示列表。 | `microservices/balance-component/test/unit/service/closeFunction.test.ts lines 438-474` |
| N+1 批量抓取的行为等价性——5 种候选形态，各自被不同分支阻止/放行 | 5 份 IPLC_LC 候选：完全符合资格；own-PENDING（未释放的 AMEND_DECREASE）；SG-PENDING（未释放的 SG ISSUE，sgConfirmedBalance 保持为 0）；SG-RELEASED-nonzero（SG 已开立并释放，未赎回）；Acceptance-PENDING（未释放的 Acceptance CREATE）。 | 在完成批量抓取 N+1 优化之后，调用 listCloseEligibleContracts('IPLC_LC')。 | 只有完全符合资格的候选存活下来；4 个批量存储方法（listByContractIds/listShgtMovementsForParents/listAcceptanceMovementsForParents/listExaminationMovementsForParents——对 IPLC_LC 不适用）各自恰好被调用一次，绝不会按候选逐条调用。——*余额影响：* N/A——验证了查询次数优化没有改变资格判定结果。 | `microservices/balance-component/test/unit/service/closeEligibleContractsBatch.test.ts lines 149-237` |
