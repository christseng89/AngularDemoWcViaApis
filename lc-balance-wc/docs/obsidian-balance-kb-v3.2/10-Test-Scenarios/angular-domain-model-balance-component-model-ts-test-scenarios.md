---
knowledge_id: angular-domain-model-balance-component-model-ts-test-scenarios
title: "Angular 领域模型（balance-component.model.ts）测试场景"
domain: Balance
category: Test Scenarios
snapshot_date: 2026-08-22
tags:
  - balance
  - test-scenario
---

# Angular 领域模型（balance-component.model.ts）测试场景

从本主题范围的测试文件中提取了11个测试场景。这些场景所证明的规则详见 Angular Domain Model (balance-component.model.ts) 与 [[Business-Rule-Index]]。

| 场景 | 前置条件（Given） | 触发操作（When） | 预期结果（Then） | 来源 |
|---|---|---|---|---|
| A3/A3S Document Arrival 被归类为 earmark 功能 | 一笔 instrumentType='IPLC_LC'，movementType='UTILIZE' 的动账 | 调用 isEarmarkFunction()，不传入 phase 参数 | 返回 true——这一组合唯一标识 Import Document Arrival（A3/A3S），即 D3 物理事件 earmark——*余额影响：* N/A——纯粹的分类判断，不涉及任何余额数字 *容差/汇率：* N/A | `balance-component.model.spec.ts:639-641` |
| B3 Present Docs 被归类为 earmark 功能 | 一笔 instrumentType='EPLC_EXAMINATION'，movementType='CREATE' 的动账 | 调用 isEarmarkFunction() | 返回 true——这一组合唯一标识 Export Present Docs（B3）——*余额影响：* N/A *容差/汇率：* N/A | `balance-component.model.spec.ts:643-645` |
| 即使与 A3 的创建行共享相同标识，A4 的 finalize 行也绝不会被归类为 earmark | 与 A3 相同的 (IPLC_LC, UTILIZE) 组合 | 调用 isEarmarkFunction()，phase='finalize' | 返回 false——finalize 行代表的是 A4 自身真实的法律事件 Release，而非 A3 的 earmark，因此展示逻辑必须回落到普通的 PENDING/APPROVED 轨道——*余额影响：* N/A——仅涉及展示分类 *容差/汇率：* N/A | `balance-component.model.spec.ts:666-668` |
| A10/B6 的 CLOSE 动账始终显示红色徽标，并读作 CLOSING/CLOSED | 一笔针对 IPLC_LC 或 EPLC_CONFIRMATION 的 movementType='CLOSE' 动账 | 该动账处于 PENDING（已 Maker 提交，尚未 Released）或 RELEASED（真正已关闭）状态 | 两种情况下 statusBadgeClass() 都返回 'tb-status-badge--negative'；displayStatus() 返回 'CLOSING'（PENDING 时）或 'CLOSED'（RELEASED 时），绝不会返回通用的 'APPROVED'——那样红色徽标配正面语义的标签会自相矛盾——*余额影响：* Release 时会将剩余 Confirmed Balance 核销至零（依据 A10/B6 的动账规则，本文件未对此进行测试）*容差/汇率：* N/A | `balance-component.model.spec.ts:812-817, 829-834` |
| 被 REJECTED/CANCELLED 的 Close 尝试不会被重新映射为 CLOSED | 一笔 status 为 REJECTED 或 CANCELLED 的 CLOSE 动账 | 调用 displayStatus()/statusBadgeClass() | 标签仍为原始的 REJECTED/CANCELLED 字符串（不会被改写为 CLOSED/CLOSING），徽标仍为红色——但这是通过常规的状态处理逻辑，而非 CLOSE 的特殊分支——*余额影响：* N/A——核销从未真正过账 *容差/汇率：* N/A | `balance-component.model.spec.ts:819-822, 835-838` |
| Close 事件的状态徽标图标与功能标签（function-chip）图标保持一致 | 一笔 RELEASED 状态 CLOSE 动账的徽标 class，以及 A10/B6 功能代码 | 对该徽标 class 应用 statusBadgeIcon()，并对 'A10'/'B6' 应用 functionActionIcon() | 两者各自独立解析为 'cross'——这两条图标推导路径本就设计为一致，而非巧合——*余额影响：* N/A *容差/汇率：* N/A | `balance-component.model.spec.ts:840-844` |
| B2 Amendment Decrease 显示为 AMEND_DECREASE，并以去符号的正数量级展示 | 一笔 B2（EPLC_CONFIRMATION/AMEND）动账，其报文金额为 '-7000' | 同时调用 displayMovementType() 和 displayMovementAmount() | displayMovementType 返回 'AMEND_DECREASE'；displayMovementAmount 返回 '7000'（仅为量级，符号从不展示给用户）——*余额影响：* Release 后该 Confirmation 上的 Confirmed contingent liability 会减少 7000（依据别处的 AMEND_DECREASE 充分性规则；本测试仅涉及展示逻辑，未实际验证）*容差/汇率：* N/A——容差换算（ceilingAmount）会对同一量级进行缩放，但从不改变其符号，因此按照其自身的文档注释，displayMovementAmount() 同样可以安全地作用于 ceilingAmount | `balance-component.model.spec.ts:689-692` |
| B2 Amendment Increase（包括零值边界情况）显示为 AMEND_INCREASE | 一笔 amount='0' 的 B2 动账 | 调用 displayMovementType() | 返回 'AMEND_INCREASE'（零不小于 0）——测试自身的注释指出，这一边界情况在实践中并无实际意义，因为 submit-rules.ts 中另一道独立的 Amount>0 校验已经排除了真正的零值到达此函数的可能——*余额影响：* N/A——边界情况，通过真实的 Submit 无法触及 *容差/汇率：* N/A | `balance-component.model.spec.ts:698-700` |
| 其余所有动账组合都原样通过 displayMovementType/Amount，包括 A2 自身真实的 AMEND_INCREASE/AMEND_DECREASE | 一笔 IPLC_LC/AMEND_INCREASE、IPLC_LC/AMEND_DECREASE、IPLC_LC/UTILIZE 或 EPLC_CONFIRMATION/ISSUE 类型的动账 | 调用 displayMovementType()/displayMovementAmount() | movementType 和 amount 均按原样返回，不做任何去符号处理——A2 本身已针对每个方向拥有真正独立的 movementType，无需转换——*余额影响：* N/A *容差/汇率：* N/A | `balance-component.model.spec.ts:702-709` |
| contractStatusBadgeClass 的 closingPending 覆盖逻辑会标记出正在进行 Close 的 ACTIVE 合约 | 一份 ContractStatus 仍为 ACTIVE 的合约（其 CLOSE 动账已 Maker 提交但尚未 Released——ContractStatus 只有在 Release 时才会变为 CLOSED），且 closingPending=true | 调用 contractStatusBadgeClass()/contractStatusLabel() | badge -> 'tb-status-badge--negative'（红色），label -> 'CLOSING'，覆盖了仅凭 ContractStatus 本身原本会显示的默认绿色/ACTIVE——*余额影响：* N/A——仅为索引行的展示标记，不涉及余额变动 *容差/汇率：* N/A | `balance-component.model.spec.ts:879-882` |
| 一旦合约已处于终态，closingPending 将被忽略 | 一份 ContractStatus='CLOSED' 的合约，即便仍传入 closingPending=true | 调用 contractStatusBadgeClass()/contractStatusLabel() | 仍然解析为红色/'CLOSED'——一旦合约确实不再处于 ACTIVE 状态，closingPending 就没有任何可覆盖的内容了——*余额影响：* N/A *容差/汇率：* N/A | `balance-component.model.spec.ts:884-887` |
