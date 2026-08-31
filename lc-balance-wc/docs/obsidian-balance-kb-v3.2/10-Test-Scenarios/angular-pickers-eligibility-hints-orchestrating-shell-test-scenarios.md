---
knowledge_id: angular-pickers-eligibility-hints-orchestrating-shell-test-scenarios
title: "Angular 选择器、可选取性提示、编排壳层 测试场景"
domain: Balance
category: Test Scenarios
snapshot_date: 2026-08-22
tags:
  - balance
  - test-scenario
---

# Angular 选择器、可选取性提示、编排壳层 测试场景

从本主题范围的测试文件中提取了6个测试场景。这些场景所证明的规则详见 Angular Pickers, Eligibility Hints, Orchestrating Shell 与 [[Business-Rule-Index]]。

| 场景 | 前置条件（Given） | 触发操作（When） | 预期结果（Then） | 来源 |
|---|---|---|---|---|
| A4 自身的选择器（picker）会排除仅处于 EARMARKING（尚未经 Checker 确认）状态的 Document Arrival | 一笔 IPLC_LC/UTILIZE 动账处于 PENDING 状态，acknowledgedAt = null（仅由 A3 完成 Maker 提交，尚未经 A3 自身的 Checker 批准） | A4 为其父合约加载自身的 payable-movement 列表 | 该动账会从 payableMovements 中被排除（过滤条件要求 UTILIZE 的 acknowledgedAt 为真值），也会从 LC 级别的提示映射中被排除——A4 的选择器不会显示任何可选内容——*余额影响：* 无——不会创建或释放任何动账；该条目在 A3 的 Checker 采取行动之前始终不可选 *容差/汇率：* N/A | `picker-selection.service.ts loadPayableMovements()（业务指示 2026-08-20，"A4 選取 EARMARKED 的交易"）` |
| A4 会排除自己已经完成 Maker 提交的条目 | 一笔 UTILIZE 动账处于 EARMARKED 状态（acknowledgedAt 已设置），但 A4 已经对其调用过 maker-submit（makerSubmittedAt 也已设置） | A4 的选择器重新加载 | 被排除——组合过滤条件 `!!acknowledgedAt && !makerSubmittedAt` 此时求值为 false——*余额影响：* 无——防止针对同一笔动账再次发起注定会返回 409 的第二次 Maker Submit *容差/汇率：* N/A | `picker-selection.service.ts loadPayableMovements() 文档注释（现场报告，"已經Submit 為何可以A4重複出現再選取"）` |
| 跨合约候选项一旦变为 RELEASED 且尚未被消耗，B4 即可选取 | 一笔 B3 EPLC_EXAMINATION CREATE 动账已 RELEASED，且 presentDocsConsumedAt 仍为 null | B4 在其父 Confirmation 的 LC Number 下，跨子合约加载可支付（payable）动账 | 该候选项会被包含在内（status===RELEASED 满足 sourceAlreadyReleasedBeforePick，movementType 匹配所需类型，且尚未被消耗）——*余额影响：* 在选取阶段尚无影响——B4 自身的 Submit 会通过 referencedTransactionId 对其进行临时性消耗 *容差/汇率：* N/A | `picker-selection.service.ts loadPayableMovementsAcrossChildContracts()` |
| 一个独立的 Checker 会话现在可以 Release 一笔自己从未 Submit 过的组合型 B4/A6/A3S/B5 动账 | 一名 Checker 全新打开应用（本会话中未进行任何 Submit，makerContext.submitResult 为 null），并搜索/选定了一笔 referencedTransactionId 已设置的 B4 动账 | 该 Checker 点击 Release | release() 顶层的校验现在会通过（仅凭 selectedCheckerMovement 即已足够），完整的组合式释放链会针对所有关联分支执行——*余额影响：* 所有关联分支会一并释放（例如 Confirmation 的 Honour/Accept 及其 Acceptance 负债分支）——此前这一点击会静默地不产生任何效果，使该笔交易永久卡在 PENDING 状态 *容差/汇率：* N/A | `transaction-builder.component.ts release() 文档注释（业务方报告，2026-08-21，"B4 Submit 後跳出交易 再進入B4 SEARCH...點選RELEASE => 無法處理"）` |
| 当搜索将列表收窄至恰好一个匹配项时，会针对该唯一剩余的 SG 触发自动选取 | 在 A4/A6 自身的 payable-movement 搜索框中输入内容，将 filteredPayableMovements 收窄至恰好一行 | 运行 onPayableMovementSearchChange() | 会针对该唯一一行自动调用 selectPayMovement()，返回与手动点击相同的结果（并显示 autoPickedHint，与实际的自动选取保持同步）——*余额影响：* 无——仅涉及选取/字段填充 *容差/汇率：* N/A | `picker-selection.service.ts onPayableMovementSearchChange()` |
| CatalogPickerService 展示的总数反映的是合格集合，而非原始抓取结果 | 原始 catalog() 调用返回了 12 份 ACTIVE 状态的 LC，但在加载各自的实时快照后，只有 4 份通过了调用方自身的零余额排除过滤条件 | CatalogPickerService.load() 完成其 contracts-set 与 snapshot-load 两个阶段 | `total` 会在快照加载完成后，通过调用方的 qualifies() 回调重新计算，因此选择器显示的是 "4 total"，而不是原始的 "12 total"——*余额影响：* 无——仅涉及展示的正确性，但可以避免让 Maker 误以为存在比实际可用数量更多的候选项 *容差/汇率：* N/A | `catalog-picker.service.ts load()/loadSnapshotsInto()（依据 CLAUDE.md 的逐页分页排查修复的真实缺陷）` |
