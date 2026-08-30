---
knowledge_id: express-routes-end-to-end-api-behavior-test-scenarios
title: "Express 路由 + 端到端 API 行为 测试场景"
domain: Balance
category: Test Scenarios
snapshot_date: 2026-08-22
tags:
  - balance
  - test-scenario
---

# Express 路由 + 端到端 API 行为 测试场景

从本主题范围的测试文件中提取了14个测试场景。这些场景所证明的规则详见 Express Routes + End-to-End API Behavior 与 [[Business-Rule-Index]]。

| 场景 | 前置条件（Given） | 触发操作（When） | 预期结果（Then） | 来源 |
|---|---|---|---|---|
| 对同一个 eventSeq 的幂等重复提交会返回原始记录，而不是新记录 | 已在 eventSeq 3 创建了一笔 50,000 的 IPLC_LC UTILIZE。 | 针对相同的 balanceContractId + eventSeq 3 再次发送 POST /balance-movements，此次 amount 为 999999。 | 返回 200 OK（而非 201），body.movementId 等于原始动账的 id，body.amount 仍为 '50000'。 | `test/unit/app.test.ts:87-102` |
| 针对已 ACTIVE 状态的 LC Number 再次 ISSUE 会被拒绝，余额不会翻倍 | LC 'DUP-001' 已 Issue 并 Release，金额为 100,000。 | 针对同一个 LC Number 'DUP-001' 再次 POST 一笔 999999 的 ISSUE。 | 返回 409 NATURAL_KEY_ALREADY_EXISTS；GET .../balance 仍显示 confirmedBalance 为 '100000'。——*余额影响：* 无变化——被拒绝的第二次 ISSUE 从未持久化。 | `test/unit/app.test.ts:955-990` |
| Sight LC 的 UTILIZE 在未经过 Maker Submit 之前无法被 Released | 一份 Sight tenor 的 IPLC_LC 已 Issue 并 Release；针对其创建了一笔 40,000 的 UTILIZE，处于 PENDING 状态。 | 在从未调用 POST .../maker-submit 的情况下，针对该 UTILIZE 直接调用 POST .../release。 | 返回 409 ILLEGAL_STATE_TRANSITION（'requires a Maker Submit'）；通过 Event Timeline 确认该动账仍为 PENDING。 | `test/unit/app.test.ts:2738-2755` |
| 同一笔 Sight UTILIZE 在完成 Maker-Submit 后可以正常 Release | 与上一场景相同的前置条件。 | 调用 POST .../maker-submit（设置 makerSubmittedBy），随后调用 POST .../release。 | release 返回 200，status 为 RELEASED。 | `test/unit/app.test.ts:2757-2771` |
| 超出 Confirmation 经 Present-Earmark 调整后 Tight Available Balance 的 Present Docs 提示单据会被拒绝 | Confirmation E001 已 Issue 并 Release，金额为 100,000；尚未过账任何 HONOUR/ACCEPT，因此 Available 为完整的 100,000。 | 针对其 POST 一笔 150,000 的 EPLC_EXAMINATION CREATE。 | 返回 409 INSUFFICIENT_AVAILABLE_BALANCE，报错信息中注明父级经 Present Earmark 调整后的 Tight Available Balance 为 100000。——*容差/汇率：* 不适用——EPLC_EXAMINATION 不适用任何容差换算。 | `test/unit/app.test.ts:1495-1515` |
| 两笔单独看均在额度内、合计却超出 Available 的 Present Docs 提示单据，会在第二笔时被正确捕获 | Confirmation E001（Available 100,000）已存在一笔 PENDING 状态、金额为 90,000 的 EB03 提示单据（剩余空间为 10,000）。 | POST 第二笔金额为 20,000 的 EPLC_EXAMINATION（EB04）。 | 返回 409 INSUFFICIENT_AVAILABLE_BALANCE，明确引用 10,000 的剩余空间数字；随后一笔金额恰为 10,000 的提示单据（EB05）以 201 成功。 | `test/unit/app.test.ts:1551-1585` |
| B3 Present Docs 的释放会将 earmark 从 Pending 迁移到 Approved，且不改变 Tight Available | EB03（90,000）与 EB05（10,000）均处于 PENDING 状态，presentDocsEarmarkPending=100000，tightAvailableBalance=0。 | 针对 EB03 的动账调用 POST .../release。 | status 变为 RELEASED，presentDocsEarmarkPending 降至 10,000，presentDocsEarmarkApproved 升至 90,000，tightAvailableBalance 保持 0（因两个桶相加，净值不变）。 | `test/unit/app.test.ts:1605-1618` |
| 已 Released 的 B3 提示单据无法再次 Released | EB03 已在上一场景中刚被 Released。 | 针对同一个 EB03 movementId 再次调用 POST .../release。 | 返回 409 ILLEGAL_STATE_TRANSITION（'not a legal transition'）——B4 必须通过 referencedTransactionId 消耗它，而不是再次将其 release。 | `test/unit/app.test.ts:1620-1624` |
| 即便此后发生了兄弟账本事件，GET .../balance-as-of 依然保持冻结 | LC TIMELINE-001 已捕获 3 个事件（Issue 100k、AmendDecrease 20k、Utilize 30k），均发生在任何 Shipping Guarantee 存在之前。 | 在上述 3 个事件各自的 movementId 已被捕获之后，针对同一份 LC 创建并 Release 了一笔 20,000 的 SHGT ISSUE。 | 针对前 3 个 movementId 重新查询 balance-as-of，仍显示 offBalanceExposure 为 '0'（而非新的 20,000）；只有 LC 的实时（LIVE）快照才显示 offBalanceExposure 为 '20000'。 | `test/unit/app.test.ts:792-821` |
| A4 Release 会保持 A3 自身创建时的 eventSnapshot 不变，改为将释放时的数字写入 finalizeEventSnapshot | 在 Confirmed Balance 仍为 100,000 时创建了一笔 Sight LC UTILIZE（A3）（其自身的 eventSnapshot 在 Create 时被捕获）。 | 该 UTILIZE 经过 Maker-Submit 后被 Release（A4），Confirmed Balance 变为 60,000。 | RELEASED 响应自身的 eventSnapshot.confirmedBalance 仍为 '100000'（与 Create 时的快照逐字节相同）；finalizeEventSnapshot.confirmedBalance 为 '60000'。通过 Event Timeline 重新获取时，两者均保持一致。 | `test/unit/app.test.ts:2819-2851` |
| 同样的保留机制并不适用于经由 A6 释放的 Usance UTILIZE | 创建了一笔 Sellers-Usance LC 的 UTILIZE（其自身的 eventSnapshot 中 Confirmed 为 100,000）。 | 该动账被直接 Release（不经过 maker-submit 步骤，因为 A6 自身的流程从不调用它）。 | released.eventSnapshot 确实被覆写（confirmedBalance 变为 '60000'），且 finalizeEventSnapshot 保持为 null——证明该保留行为仅适用于 Sight。 | `test/unit/app.test.ts:2853-2880` |
| includeAnyStatus 使已 CLOSED 的 LC 仍能按自然键（natural key）用于查询解析，而默认情况下仍为 404 | 一份 LC 已 Issue、Release，随后被 Close（A10，全额核销 Confirmed Balance，并 Release）。 | 先在不带任何标志的情况下调用 GET /balance-contracts?...&lcNumber=X，随后再带上 includeAnyStatus=true 调用一次。 | 不带标志时：404。带标志时：200，status 为 'CLOSED'，balanceContractId 相同；该合约的 Event Timeline 仍同时显示 ISSUE 与 CLOSE 事件。 | `test/unit/app.test.ts:2372-2414` |
| close-eligible 会排除携带非零、且已 RELEASED 的 SG 余额的候选合约 | LC-CLOSEHINT-OK（无子合约）与 LC-CLOSEHINT-SG（有一笔已 Released、金额 2,000、从未赎回的 SG Issue）均已 Issue 并 Release。 | 调用 GET /balance-contracts/close-eligible?instrumentType=IPLC_LC。 | 响应的 items 中包含 LC-CLOSEHINT-OK 的 lcNumber，但不包含 LC-CLOSEHINT-SG 的——即使 SG 动账本身已完全 Released（没有任何 PENDING 事件），非零的未结清 SG 仍会阻止 Close 资格。 | `test/unit/app.test.ts:2322-2370` |
| GET /balance-movements?businessEventId= 会跨不同合约将一次组合提交的两条分支关联起来 | 存在一份 LC（BEID-LC1）及其子级 SG（BEID-SG1）；创建了共享同一个 businessEventId 的 SHGT FULL_REDEEM 与 LC UTILIZE。 | 调用 GET /balance-movements?businessEventId=<id>。 | 恰好返回这两笔关联的动账，按最早优先排序，[FULL_REDEEM, UTILIZE]——若没有任何动账携带该 businessEventId，则返回空数组（200），绝不会返回 404。 | `test/unit/app.test.ts:3150-3225` |
