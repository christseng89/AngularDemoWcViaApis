---
knowledge_id: inquire-events-look-up-current-balance-read-model-test-scenarios
title: "查询事件 + 查看当前余额（读模型）测试场景"
domain: Balance
category: Test Scenarios
snapshot_date: 2026-08-22
tags:
  - balance
  - test-scenario
---

# 查询事件 + 查看当前余额（读模型）测试场景

从本主题范围的测试文件中提取了6个测试场景。这些场景所证明的规则详见 Inquire Events + Look Up Current Balance (read-model) 与 [[Business-Rule-Index]]。

| 场景 | 前置条件（Given） | 触发操作（When） | 预期结果（Then） | 来源 |
|---|---|---|---|---|
| LC S01 复现：合并时间线会正确地将已完成的 Sight Document Arrival 拆分为 create/finalize 两行，并按真实时间排序 | 根级 IPLC_LC S01（SIGHT tenor），动账包括：ISSUE（A1，createdAt 11:30:08）与 UTILIZE（A3->A4，status 为 RELEASED，createdAt 11:30:35，releasedAt 15:37:08，自身 eventSnapshot=a3CreateSnapshot，confirmedBalance=100000，finalizeEventSnapshot=a4FinalizeSnapshot，confirmedBalance=60000）；S01 下有一份子级 SHGT 合约 G01，带有一笔 ISSUE 动账（A8，createdAt 11:31:01） | 针对 lcNumber S01 调用 InquireEventsService.search() | events 按以下顺序共有 4 行：A1（primary）、A3（create，phase='create'）、A8（primary）、A4（finalize，phase='finalize')——按 eventTime 而非 eventSeq 排序。全部 4 行报告的 eventStatus 均为 RELEASED（create 行绝不会被冻结显示为 PENDING）。选择 create 行会以标签快照 a3CreateSnapshot 解析出功能 A3；选择 finalize 行会以标签快照 a4FinalizeSnapshot 解析出功能 A4——两行显示的真实影响（balanceBefore/balanceAfter）完全相同。——*余额影响：* Confirmed Balance 从 a3CreateSnapshot 中的数字（A3-create 时点为 100000）变化到 a4FinalizeSnapshot 中的数字（60000，在 A4 自身 Release 时单独捕获）——这两个快照是刻意设计为不同的、各自在其自身时点被冻结的记录，而非实时重新计算。*容差/汇率：* 本场景未涉及（容差换算发生在 LC 的 ISSUE/AMEND，而非 UTILIZE/finalize）。 | `inquire-events.service.spec.ts:142-197` |
| 当 finalizeEventSnapshot 为 null 时（迁移前的数据），'finalize' 行会回退使用 create 时的 eventSnapshot | 一笔 RELEASED 状态的 Sight IPLC_LC UTILIZE，带有 eventSnapshot（confirmedBalance 55555），但 finalizeEventSnapshot 明确为 null | 选择拆分对中的 'finalize' 行 | LC 标签的快照等于普通的 eventSnapshot（confirmedBalance 55555），而不是实时重新获取——回退链为 finalizeEventSnapshot ?? eventSnapshot ?? null，按每个标签分别应用。——*余额影响：* 没有实时重新计算；迁移前记录唯一可用的数字会被两个阶段共同复用。*容差/汇率：* 不适用。 | `inquire-events.service.spec.ts:199-211` |
| Usance tenor 的 Document Arrival 绝不会被拆分为 create/finalize 两行 | 根级 IPLC_LC，tenorType 为 BUYERS_USANCE，带有一笔 releasedAt 已设置的 RELEASED 状态 UTILIZE 动账 | toEventRows() 处理该动账 | 恰好产生一行 'primary'——拆分逻辑严格限定于 SIGHT tenor，因为 Usance Document Arrival 之后的结算（A6）总是会创建自己独立的 Acceptance 动账，而不是原地完成（finalize）此笔动账。——*余额影响：* N/A——单行，单一余额记录。*容差/汇率：* N/A | `inquire-events.service.spec.ts:213-225` |
| 单个子级的抓取失败会优雅降级，而不会破坏整个合并时间线 | 一份根级 LC，其自身的 listMovements() 成功，但其中一个子合约自身的 listMovements()（或子级 catalog() 调用本身）抛出异常/报错 | search()/loadEvents() 对根级 + 子级来源执行 forkJoin | 失败的子级自身的贡献（通过 catchError）解析为空的 InquiredEvent[]，而根级自身的动账（以及其他子级的）仍能成功填充到合并排序后的时间线中——这一部分失败不会向用户呈现任何错误。——*余额影响：* 受影响子级自身的事件只是从时间线中缺失；不会有任何余额数字被破坏（每个标签都各自独立读取自己持久化的快照）。*容差/汇率：* N/A | `inquire-events.service.spec.ts:240-270` |
| closingPending 会正确追踪仍处于 PENDING 状态的 A10 Close，并在 Release 和 Reject 两种情况下都会恢复 | 一份 Import LC（IPLC_LC），其上有一笔处于多种不同状态的 CLOSE 动账 | loadIndex() 为该合约推导出 LC Master Records Index 行 | 当该 CLOSE 动账自身的 eventStatus 为 PENDING 时，closingPending 为 true（即便 contract.status 仍显示为 ACTIVE）；一旦 Checker 将其 Release，contract.status 变为 CLOSED，closingPending 变为 false；若 Checker 改为将其 Reject，contract.status 恢复/保持为 ACTIVE，closingPending 也随之恢复为 false（无需任何特殊处理代码——每次加载时都会重新推导）。这一规则同样在 B6/EPLC_CONFIRMATION（出口侧）得到确认，不仅限于 A10/Import。——*余额影响：* CLOSE 核销只有在 Release 时才会将 Confirmed Balance 清零；仍处于 PENDING 状态时（closingPending=true），余额不受影响。*容差/汇率：* N/A | `inquire-events.service.spec.ts:395-465` |
| Balance Tabs 只会填充与所选事件自身账本相匹配的标签，其余兄弟标签则来自已持久化的兄弟快照 | 所选的 InquiredEvent 分别属于 (a) 根级 LC、(b) SHGT 子级、(c) Acceptance 子级，或 (d) EPLC_EXAMINATION（B3）子级 | selectEvent() 构建 selectedEventTabs | (a) 只有 LC 标签会获得 ownImpact；Acceptance/SG 标签（若显示）会获得各自持久化的兄弟快照，impact 为 null。(b) 只有 SG 标签会获得 ownImpact；LC 标签读取 movement.rootEventSnapshot，impact 为 null。(c) 只有 Acceptance 标签会获得 ownImpact；LC 标签读取 rootEventSnapshot。(d) EPLC_EXAMINATION 事件完全没有专属标签——只有 LC/Confirmed-LC 标签会被填充，数据来自 rootEventSnapshot，impact 为 null。——*余额影响：* 对于每个所选事件，永远只会展示唯一一个账本真实的前后变化（before->after）；其余所有可见标签只展示某一时点的静态数字。*容差/汇率：* N/A | `inquire-events.service.spec.ts:773-846` |
