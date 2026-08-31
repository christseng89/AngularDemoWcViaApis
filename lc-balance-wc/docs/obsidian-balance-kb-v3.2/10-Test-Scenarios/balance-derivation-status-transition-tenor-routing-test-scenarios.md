---
knowledge_id: balance-derivation-status-transition-tenor-routing-test-scenarios
title: "余额推导、状态转换、Tenor 路由 测试场景"
domain: Balance
category: Test Scenarios
snapshot_date: 2026-08-22
tags:
  - balance
  - test-scenario
---

# 余额推导、状态转换、Tenor 路由 测试场景

从本主题范围的测试文件中提取了11个测试场景。这些场景所证明的规则详见 Balance Derivation, Status Transition, Tenor Routing 与 [[Business-Rule-Index]]。

| 场景 | 前置条件（Given） | 触发操作（When） | 预期结果（Then） | 来源 |
|---|---|---|---|---|
| Confirmed Balance 仅汇总 RELEASED 状态的动账，并按 MOVEMENT_DIRECTION 带符号计算 | 动账：ISSUE RELEASED（amount 100000，ceiling 110000）；UTILIZE RELEASED（amount 50000，ceiling 50000）；UTILIZE PENDING（amount 20000，ceiling 20000） | 调用 computeConfirmedBalance(movements) | 返回 60000——PENDING 状态的 UTILIZE 完全被排除在汇总之外——*余额影响：* Confirmed Balance = 110000（ISSUE）- 50000（RELEASED 的 UTILIZE）= 60000；20000 的 PENDING UTILIZE 对 Confirmed Balance 没有任何影响 *容差/汇率：* 使用的是 ceilingAmount（上游已完成容差换算），而非原始 amount——本测试本身不涉及容差换算 | `microservices/balance-component/test/unit/domain/balanceDerivation.test.ts lines 11-18` |
| Confirmed Balance 的推导在遇到未映射的 movementType 时会明确报错 | 一笔 movementType='SOME_UNKNOWN_TYPE'，status 为 RELEASED 的动账 | 调用 computeConfirmedBalance(movements) | 抛出一个匹配 /MOVEMENT_DIRECTION has no entry/ 的 Error，而不是静默地按零贡献处理——*余额影响：* 对于无法识别的 movementType，不会静默产生错误的余额计算——调用方必须先扩展 MOVEMENT_DIRECTION *容差/汇率：* N/A | `microservices/balance-component/test/unit/domain/balanceDerivation.test.ts lines 20-23` |
| Available Balance 会将 PENDING 状态的 UTILIZE earmark 与 Confirmed Balance 相抵 | 动账：ISSUE RELEASED（ceiling 110000）；UTILIZE PENDING（ceiling 30000） | confirmed = computeConfirmedBalance(movements)；调用 computeAvailableBalance(confirmed, movements) | confirmed.toFixed() === '110000'；computeAvailableBalance 返回 80000——*余额影响：* Available Balance = 110000（Confirmed）- 30000（PENDING 状态的 UTILIZE earmark）= 80000，即便该 UTILIZE 尚未经 Checker 释放 *容差/汇率：* 本场景未涉及 | `microservices/balance-component/test/unit/domain/balanceDerivation.test.ts lines 27-32` |
| Face Amount 独立于 UTILIZE 进行追踪 | 动账：ISSUE RELEASED（amount 100000，ceiling 110000）；AMEND_INCREASE RELEASED（amount 10000，ceiling 11000）；UTILIZE RELEASED（amount 50000，ceiling 50000） | 调用 computeFaceAmount(movements) | 返回 110000——UTILIZE 的金额从不参与计算——*余额影响：* Face Amount = 100000 + 10000 = 110000，不受该 50000 提用（该提用确实在别处减少了 Confirmed Balance）的影响 *容差/汇率：* 使用的是原始 `amount`（未经容差换算的面值级别数字），而非 ceilingAmount——一旦发生 UTILIZE/AMEND_DECREASE，Face Amount 与 Confirmed Balance 就可能合理地产生分歧 | `microservices/balance-component/test/unit/domain/balanceDerivation.test.ts lines 36-43` |
| PENDING 状态的动账可以被 Released、Rejected、Cancelled 或 Superseded（Edited） | currentStatus = 'PENDING' | 分别以 action RELEASE / REJECT / CANCEL / EDIT 调用 applyStatusTransition() | 分别返回 RELEASED / REJECTED / CANCELLED / SUPERSEDED——这四种转换从 PENDING 出发均为合法——*余额影响：* 只有 RELEASE 这一结果会改变 Confirmed Balance（该动账变为 RELEASED，之后会被计入 computeConfirmedBalance 的汇总）；REJECT/CANCEL/SUPERSEDED 都会使该动账不再以 PENDING 身份贡献 Available Balance *容差/汇率：* N/A——仅涉及状态转换，不涉及金额 | `microservices/balance-component/test/unit/domain/statusTransition.test.ts lines 5-14` |
| 状态机允许 Maker 与 Checker 为同一用户 | currentStatus = 'PENDING'，createdBy = 'alice'，actingUser = 'alice' | applyStatusTransition 执行 action RELEASE | 返回 'RELEASED'——不会因为同一用户而被拒绝——*余额影响：* N/A *容差/汇率：* N/A | `microservices/balance-component/test/unit/domain/statusTransition.test.ts lines 16-18` |
| 已 REJECTED 的动账无法再次 Released；终态状态会拒绝所有操作 | 五组 (currentStatus, action) 组合：(RELEASED, RELEASE)、(RELEASED, REJECT)、(REJECTED, RELEASE)、(CANCELLED, CANCEL)、(SUPERSEDED, EDIT) | 针对每一组分别调用 applyStatusTransition() | 每次调用都会抛出 IllegalStateTransitionError，绝不会静默成功——*余额影响：* 防止通过非法的二次转换（例如对已 RELEASED 的动账重复释放，若允许将导致 computeConfirmedBalance 中的重复计算）对该动账的余额影响进行重复计算或反转 *容差/汇率：* N/A | `microservices/balance-component/test/unit/domain/statusTransition.test.ts lines 20-28` |
| 在 Sight tenor 的父级 LC 下，Acceptance CREATE 会被阻止 | parentTenorType = 'SIGHT'，parentBalanceContractId = 'bc-sight-1'，requestedTenorType = undefined | 调用 checkAcceptanceTenorConsistency() | 返回 ok:false，报错信息中注明父合约 id，并引用 'Design doc §7 Tenor Type Routing'——*余额影响：* 阻止对应的 Acceptance CREATE 动账被创建——由于 createMovement() 在持久化之前就拒绝了请求，不会产生任何 MOVEMENT_DIRECTION 影响 *容差/汇率：* N/A——Acceptance/SHGT 类 movementType 完全被排除在 TOLERANCE_APPLICABLE_MOVEMENT_TYPES 之外 | `microservices/balance-component/test/unit/domain/tenorRouting.test.ts lines 36-46` |
| 无论请求的 tenorType 为何，Sight 父级的拒绝逻辑都会先于 tenor 不匹配比较触发 | parentTenorType = 'SIGHT'，requestedTenorType = 'BUYERS_USANCE'（若非如此，该值原本需要参与比较） | 调用 checkAcceptanceTenorConsistency() | 仍然返回 ok:false，报错为 Sight 专属报错，而非 tenor 不匹配报错——Sight 检查会优先短路——*余额影响：* 与上一行相同——不会创建任何动账 *容差/汇率：* N/A | `microservices/balance-component/test/unit/domain/tenorRouting.test.ts lines 48-57` |
| 针对非 Sight 父级的 Acceptance tenorType 不匹配会被拒绝 | parentTenorType = 'BUYERS_USANCE'，requestedTenorType = 'SELLERS_USANCE' | 调用 checkAcceptanceTenorConsistency() | 返回 ok:false，报错信息中列出两个值，并说明二者必须一致——*余额影响：* 阻止创建内部不一致的 Acceptance 记录 *容差/汇率：* N/A | `microservices/balance-component/test/unit/domain/tenorRouting.test.ts lines 59-70` |
| 缺少 parentTenorType 或 requestedTenorType 时，因无可比较项而通过校验 | 两种情况：(a) parentTenorType 为 null，requestedTenorType 为 'BUYERS_USANCE'；(b) parentTenorType 为 'SELLERS_USANCE'，requestedTenorType 为 undefined | 针对每种情况分别调用 checkAcceptanceTenorConsistency() | 两种情况均返回 ok:true——*余额影响：* Acceptance CREATE 进入下一阶段的校验 *容差/汇率：* N/A | `microservices/balance-component/test/unit/domain/tenorRouting.test.ts lines 18-34` |
