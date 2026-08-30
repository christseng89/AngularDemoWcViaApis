---
knowledge_id: angular-business-function-catalog-strategy-policy-rules-test-scenarios
title: "Angular 业务功能目录（Strategy/Policy/Rules）测试场景"
domain: Balance
category: Test Scenarios
snapshot_date: 2026-08-22
tags:
  - balance
  - test-scenario
---

# Angular 业务功能目录（Strategy/Policy/Rules）测试场景

从本主题范围的测试文件中提取了12个测试场景。这些场景所证明的规则详见 Angular Business Function Catalog (Strategy/Policy/Rules) 与 [[Business-Rule-Index]]。

| 场景 | 前置条件（Given） | 触发操作（When） | 预期结果（Then） | 来源 |
|---|---|---|---|---|
| B4-CLOSE 错误标注缺陷已修复——CLOSE 现在解析为 B6，而不是 B4 | 一份 EPLC_CONFIRMATION 合约上记录了类型为 ISSUE、AMEND、HONOUR/ACCEPT 和 CLOSE 的多笔动账（movement）。 | 针对每个 movementType 调用 resolveFunctionForMovement('EPLC_CONFIRMATION', movementType)。 | ISSUE 解析为 B1，AMEND 解析为 B2，CLOSE 解析为 B6——只有 HONOUR 和 ACCEPT 才解析为 B4；修复前的代码会把任意 EPLC_CONFIRMATION 的 movementType 无条件匹配到 B4，因为 derivesMovementTypeFromTenor 的分支实际上从未真正检查过 movementType 的值。 | `function-strategy.spec.ts:128-132` |
| A9 SG Redemption 拒绝任何与 SG 可用余额不完全相等的金额 | A9 上下文中，Shipping Guarantee 快照的 availableBalance 为 80000。 | Maker 提交金额 90000（超出可用余额）或 50000（低于可用余额的真实部分金额）。 | validateSubmit() 对两种情况均会失败，报错为 "A Shipping Guarantee Redemption (A9) must be for the FULL Available Balance (80000) — Partial Redeem is no longer supported here."——Partial Redeem 不会被静默降级处理，而是被硬性拒绝。 | `submit-rules.spec.ts:315-339` |
| A9 SG Redemption 仅在金额恰好等于可用余额时成功，并硬编码为 FULL_REDEEM | A9 上下文，availableBalance=80000，输入金额=80000。 | 运行 validateSubmit()。 | error 为 null，且 patch.movementType 被硬编码为 'FULL_REDEEM'（这是边界情况——当前 UI 实际上只能产生这一个值）。 | `submit-rules.spec.ts:325-329` |
| B5 根据输入金额与可用余额的比较，推导出 FULL_SETTLE 或 PARTIAL_SETTLE | B5 上下文（EPLC_ACCEPTANCE），availableBalance=80000。 | Maker 分别输入 80000（等于可用余额）、30000（低于可用余额）、90000（超过可用余额）。 | 80000 -> patch.movementType='FULL_SETTLE'；30000 -> patch.movementType='PARTIAL_SETTLE'；90000 -> 拒绝并报错 "Amount must not exceed the Acceptance's Available Balance (80000)."。 | `submit-rules.spec.ts:356-381` |
| B2 Decrease 提交的是负数报文金额，但绝不会修改 Maker 输入的 model.amount | B2 上下文，model.amount='5000'，amendDirection='DECREASE'。 | 调用 buildSubmitRequest()。 | request.amount 为 '-5000'，但 ctx.model.amount 仍保持 '5000' 不变——Maker 看到的实时 Formly Amount 输入框永远不会变号，只有发出的报文请求会被加上负号。 | `submit-rules.spec.ts:632-637` |
| 在明确选择 Increase/Decrease 方向之前，B2 提交会被阻止 | 一个完全有效的 B2 上下文（amount、currency、createdBy、selectedContract 均已设置），但 amendDirection 为 null。 | 运行 validateSubmit()。 | 失败并报错 "Pick Increase or Decrease for this Amendment."——即便其余所有必填字段均已通过校验，也无法绕过这道校验。 | `submit-rules.spec.ts:611-614` |
| 在选定某条仍处于 PENDING 状态的来源记录之前，A6/B4 提交会被阻止 | A6 上下文，Parent LC 已解析完成，但 selectedPayMovement 为 null。 | 运行 validateSubmit()。 | 失败并报错 "Pick the still-PENDING Document Arrival (2ndary Index) to convert first."（引用该功能自身的 pendingItemLabel，若未设置则使用通用回退文案 'Document Arrival'）；一旦选定 selectedPayMovement 即可通过。 | `submit-rules.spec.ts:255-268` |
| 必须同时解析出 Shipping Guarantee 及其快照，A3S 提交才会放行 | A3S 上下文，selectedContract 已设置但 selectedArrivalSg 为 null；或 selectedArrivalSg 已设置但 arrivalSgSnapshot 仍为 null（半解析状态）。 | 运行 validateSubmit()。 | 两种状态都会以同样的报错 "Pick the Shipping Guarantee this Document Arrival is against first." 失败——只有两者都解析完成后才能通过。 | `submit-rules.spec.ts:280-299` |
| A10/B6 Close 豁免于通用的 Amount > 0 校验，即使金额为负也不例外 | A10 上下文，model.movementType='CLOSE'，amount='0'（随后单独测试 amount='-1'）。 | 运行 validateSubmit()。 | 两种情况均不会触发 "Amount must be greater than 0." 报错——CLOSE 的豁免完全跳过了这道校验；若 CLOSE 存在针对负数金额的拒绝，也必须来自服务端「金额需与 Confirmed Balance 完全相等」的校验，而非此处。 | `submit-rules.spec.ts:585-605` |
| A6 的 hasEligibleTargetSelected 要求 Parent 与具体的待处理记录二者缺一不可 | A6 上下文依次经历 3 种状态：什么都未选择；仅选定 selectedParent；selectedParent 与 selectedPayMovement 均已选定。 | 在每种状态下都对 hasEligibleTargetSelected(ctx) 求值。 | 结果依次为 false、仍为 false（仅有 Parent 还不够）、只有当两个条件都满足时才为 true。 | `submit-rules.spec.ts:704-710` |
| BAL-135 回归防护：B5 自身的占位符字面量 movementType 不再错误地锁定其 Amount 字段 | B5 上下文，model.movementType='FULL_SETTLE'（B5 自身注册表中的占位符默认值），并已解析出 availableBalance=80000 的快照。 | 调用 buildFields()。 | Amount 字段保持可编辑状态（disabled=false），max=80000，标签为支持 Partial Settle 的样式——而不是 A7 中相同的字面量 FULL_SETTLE 本会触发的完全锁定的 amountFromFullSettle 标签，因为 amountFromFullSettle 明确排除了任何 amountVsAvailableDerivation==='SETTLE' 的功能。 | `builder-fields.spec.ts:124-134` |
| 无论输入了什么值，A1 Sight 都会将 Tenor Days 归一化为 0 | A1 上下文，tenorType='SIGHT'，输入的 tenorDays 为 45。 | 运行 validateSubmit()。 | error 为 null，且 patch.tenorDays 为 0——输入的 45 会被 patch 覆盖，永远不会以原始输入值发送到服务端。 | `submit-rules.spec.ts:190-198` |
