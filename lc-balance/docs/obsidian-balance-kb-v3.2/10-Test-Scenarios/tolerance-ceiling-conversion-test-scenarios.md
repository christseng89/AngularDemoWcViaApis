---
knowledge_id: tolerance-ceiling-conversion-test-scenarios
title: "容差 / Ceiling 换算 测试场景"
domain: Balance
category: Test Scenarios
snapshot_date: 2026-08-22
tags:
  - balance
  - test-scenario
---

# 容差 / Ceiling 换算 测试场景

从本主题范围的测试文件中提取了9个测试场景。这些场景所证明的规则详见 Tolerance / Ceiling Conversion 与 [[Business-Rule-Index]]。

| 场景 | 前置条件（Given） | 触发操作（When） | 预期结果（Then） | 来源 |
|---|---|---|---|---|
| IPLC_LC 的 ISSUE 会使用容差百分比将面值金额换算为 Ceiling | 一份 IPLC_LC 合约的 ISSUE 动账，amount 为 100000，tolerancePct 为 10 | 调用 computeCeilingAmount('100000', '10', 'ISSUE', 'IPLC_LC') | 返回 Decimal '110000'——*余额影响：* 一旦该动账被 RELEASED，实际作用于 Confirmed Balance 的是 Ceiling 级别的数字（110000），而非面值金额。*容差/汇率：* 在面值金额之上加上了 10% 的容差缓冲；不涉及汇率（单一币种换算）。 | `test/unit/domain/tolerance.test.ts:9-10 (test.each row 1)` |
| AMEND_DECREASE 同样通过相同的容差公式进行换算 | 一份 IPLC_LC 合约的 AMEND_DECREASE 动账，amount 为 120000，tolerancePct 为 10 | 调用 computeCeilingAmount('120000', '10', 'AMEND_DECREASE', 'IPLC_LC') | 返回 Decimal '132000'——*余额影响：* 证实 AMEND_DECREASE 与 ISSUE/AMEND_INCREASE 一样会进行容差换算——下游的充分性校验（amendDecrease.ts，依据 CLAUDE.md）比较的始终是这一经过容差换算的 ceilingAmount，而不是原始 amount，与 Available 进行比较。*容差/汇率：* 无论方向是增加还是减少，都应用相同的 10% 上浮公式。 | `test/unit/domain/tolerance.test.ts:9-10 (test.each row 3)` |
| EPLC_CONFIRMATION 的 ISSUE/AMEND 适用容差——保兑行的 CONF LIAB 承载缓冲 | 一份 EPLC_CONFIRMATION 合约的 ISSUE（amount 100000，tolerancePct 10）与 AMEND（amount 10000，tolerancePct 10）动账 | 分别对每笔调用 computeCeilingAmount | ISSUE 返回 '110000'；AMEND 返回 '11000'——*余额影响：* 根据源码注释中引用的 2026-08-14 业务确认，接受容差上浮的是保兑行自身的 CONF LIAB（一个以最大风险敞口为基础的数字，区别于底层仅作参考的 EPLC_LC）。*容差/汇率：* 对 Confirmation Liability 施加 10% 的缓冲，业务示例：'Confirm LC 100,000 w Tolerance 10% -> CONF LIAB 110,000.' | `test/unit/domain/tolerance.test.ts:17-20` |
| EPLC_CONFIRMATION 的 HONOUR/ACCEPT 从不进行容差换算 | 一份 EPLC_CONFIRMATION 合约的 HONOUR 动账（amount 80000，tolerancePct 10）与 ACCEPT 动账（amount 80000，tolerancePct 10） | 分别对每笔调用 computeCeilingAmount | 两者均原样返回 '80000'——*余额影响：* HONOUR/ACCEPT（B4 的 movementType）是对风险敞口进行结算/转换，而非建立或修改以最大风险敞口为基础的负债，因此即便所属单证本身适用容差，也不应施加容差上浮。*容差/汇率：* 无——无论父级的 tolerancePct 是否非空，面值都会原样传递。 | `test/unit/domain/tolerance.test.ts:22-25` |
| IPLC_LC 的 UTILIZE 从不进行容差换算 | 一份 IPLC_LC 合约的 UTILIZE 动账，amount 为 50000，tolerancePct 为 10 | 调用 computeCeilingAmount('50000', '10', 'UTILIZE', 'IPLC_LC') | 原样返回 '50000'——*余额影响：* 提用（drawdown/utilization）金额始终就是其自身的面值——容差是针对 LC 自身 ceiling 的余量概念，而不适用于针对其发生的单笔提用。*容差/汇率：* 无。 | `test/unit/domain/tolerance.test.ts:27-29` |
| IPLC_ACCEPTANCE 的 CREATE 从不进行容差换算 | 一份 IPLC_ACCEPTANCE 合约的 CREATE 动账，amount 为 50000，tolerancePct 为 10 | 调用 computeCeilingAmount('50000', '10', 'CREATE', 'IPLC_ACCEPTANCE') | 原样返回 '50000'——*余额影响：* Acceptance/DPU 负债始终就是其自身的 Bills Amount 面值——从不进行容差缓冲。*容差/汇率：* 无——instrumentType 这道关卡会在甚至检查 movementType 或 tolerancePct 之前，就先拒绝 IPLC_ACCEPTANCE。 | `test/unit/domain/tolerance.test.ts:31-33` |
| 即便组合本身适用容差，tolerancePct 为 null 或 undefined 时也都只是恒等换算 | IPLC_LC ISSUE，tolerancePct=null；以及 IPLC_LC AMEND_INCREASE，tolerancePct=undefined，两者 amount 均为 100000 | 分别对每笔调用 computeCeilingAmount | 两者均原样返回 '100000'——*余额影响：* 完全没有容差条款的合约，在 Ceiling 层面的表现与面值完全相同——只要 tolerancePct 缺失，即便该 instrument/movementType 组合本身可适用容差，ceilingAmount === amount 也始终成立。*容差/汇率：* 无——代表一份以 0%/未声明容差方式开立的 LC。 | `test/unit/domain/tolerance.test.ts:35-38` |
| 字符串形式的零 tolerancePct 同样是恒等换算 | IPLC_LC ISSUE，amount 为 100000，tolerancePct='0' | 调用 computeCeilingAmount('100000', '0', 'ISSUE', 'IPLC_LC') | 返回 '100000'——*余额影响：* 在数据层面区分了「显式声明零容差」与「完全没有容差字段」，尽管两者产生相同的数值结果。*容差/汇率：* 乘数 (1 + 0/100) = 1，因此不会施加任何上浮。 | `test/unit/domain/tolerance.test.ts:40-42` |
| 即便 movementType 字符串相同且 tolerancePct 非空，SG（SHGT）与 Bills（Acceptance）的金额仍保持面值 | 一份 SHGT 合约的 ISSUE 动账（amount 50000，tolerancePct 10）与一份 IPLC_ACCEPTANCE 合约的 AMEND_DECREASE 动账（amount 50000，tolerancePct 10） | 分别对每笔调用 computeCeilingAmount | 两者均原样返回 '50000'——*余额影响：* 直接证明了双重关卡（instrumentType 与 movementType 兼具）的设计：SHGT 自身的 ISSUE 与 Acceptance 自身的 AMEND_DECREASE 这两个 movementType 字符串会与 LC 的适用集合发生碰撞，但 instrumentType 这道关卡正确地将两者都排除在任何容差上浮之外。*容差/汇率：* 无——这正是防范模块自身文档注释中所记载的确切碰撞风险的回归测试。 | `test/unit/domain/tolerance.test.ts:44-47` |
