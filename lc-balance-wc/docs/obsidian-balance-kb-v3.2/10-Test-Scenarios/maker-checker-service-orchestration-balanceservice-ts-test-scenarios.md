---
knowledge_id: maker-checker-service-orchestration-balanceservice-ts-test-scenarios
title: "Maker/Checker 服务编排（balanceService.ts）测试场景"
domain: Balance
category: Test Scenarios
snapshot_date: 2026-08-22
tags:
  - balance
  - test-scenario
---

# Maker/Checker 服务编排（balanceService.ts）测试场景

从本主题范围的测试文件中提取了12个测试场景。这些场景所证明的规则详见 Maker/Checker Service Orchestration (balanceService.ts) 与 [[Business-Rule-Index]]。

| 场景 | 前置条件（Given） | 触发操作（When） | 预期结果（Then） | 来源 |
|---|---|---|---|---|
| BAL-115 ——金额格式错误的 AMEND_DECREASE 会抛出 InvalidMonetaryAmountError，而不是静默地进行 NaN 比较 | 一份 IPLC_LC 已 Issue（100,000）并 Release。 | 直接以 movementType AMEND_DECREASE、amount 'not-a-number' 调用 createMovement()。 | 抛出 InvalidMonetaryAmountError——即使调用方绕过路由层校验、并非通过 HTTP 调用，parseMonetaryAmount() 的强制校验依然生效。——*余额影响：* 无——在任何余额计算之前即被拒绝。*容差/汇率：* N/A | `balanceService.test.ts:18-43` |
| 格式错误的 SHGT ISSUE 会在服务层被拒绝，与 HTTP 调用方享有相同的保证 | 父级 IPLC_LC 已 Issue 并 Release。 | 针对一笔新的 SHGT ISSUE，以 amount 'garbage' 调用 createMovement()。 | 在 checkNewShgtSufficiency() 运行其比较逻辑之前，即抛出 InvalidMonetaryAmountError。——*余额影响：* 无。*容差/汇率：* N/A | `balanceService.test.ts:45-73` |
| 格式错误的 EPLC_EXAMINATION CREATE 会在服务层被拒绝 | 父级 EPLC_CONFIRMATION 已 Issue 并 Release。 | 针对一笔新的 EPLC_EXAMINATION CREATE，以 amount 'nope' 调用 createMovement()。 | 在 checkNewPresentDocsSufficiency() 运行之前，即抛出 InvalidMonetaryAmountError。——*余额影响：* 无。*容差/汇率：* N/A | `balanceService.test.ts:75-103` |
| findByBusinessEventId 会跨合约返回所有关联的动账，按最早优先排序，并排除无关的 ISSUE | 一份 LC 及其子级 SHGT 均已 Issue/Release；提交了共享同一个 businessEventId 的一对匹配记录（SG FULL_REDEEM + LC UTILIZE）。 | 调用 findByBusinessEventId(businessEventId)。 | 按创建顺序恰好返回 [sgRedeem, lcUtilize]；两份合约各自更早的 ISSUE（不带 businessEventId）均不包含在内。——*余额影响：* N/A（只读查询）。*容差/汇率：* N/A | `balanceService.test.ts:112-171` |
| Event Snapshot 生命周期——在 createMovement() 时为 PENDING，在 release() 时被覆写，在 reject() 时保持不变 | 一笔全新的 100,000 IPLC_LC ISSUE。 | 该动账被创建，随后被 Released 或 Rejected。 | createMovement() 的 eventSnapshot 显示 confirmedBalance 为 '0'、availableBalance 为 '100000'（仅体现 PENDING 贡献）；release() 之后，eventSnapshot 被覆写为 confirmedBalance '100000'；而 reject() 之后，eventSnapshot 与最初 PENDING 时的快照逐字节完全相同。——*余额影响：* Confirmed Balance 仅在 Release 时从 0 变为 100,000；Reject 会使快照记录保持冻结。*容差/汇率：* N/A | `balanceService.test.ts:189-252` |
| assertRootIssueReleased ——在根级 LC 自身的 ISSUE 被 Released 之前，针对它的所有下游操作都会被阻止，而 ISSUE 本身绝不会被阻止 | 一份 IPLC_LC 已 Issue，但被刻意保持在 PENDING 状态（未 Release）。 | 尝试针对/在其下发起 AMEND_DECREASE、UTILIZE 或全新的子级 SHGT ISSUE。 | 每一种尝试都会抛出 IllegalStateTransitionError。原始的 ISSUE 调用本身从不会抛出异常（对 ISSUE 跳过该校验）。一旦该 ISSUE 被 Release，同样的 AMEND_DECREASE 与子级 SG ISSUE 均能成功。——*余额影响：* 防止在根级 ISSUE 仍未被批准的情况下，因 UTILIZE 被释放而导致 Confirmed Balance 变为负数。*容差/汇率：* N/A | `balanceService.test.ts:644-782` |
| B3 可以独立真正 RELEASE；再次释放属于非法操作；B4 的关联释放会作为副作用标记 presentDocsConsumedAt | 一份 Confirmation 已 Issue/Release；提交了一笔独立的 10,000 EPLC_EXAMINATION/CREATE（B3），并已被独立 Release。 | （a）针对同一笔 B3 动账再次尝试 release()；（b）创建并释放一笔通过 referencedTransactionId 引用该 B3 动账的 B4 HONOUR。 | （a）抛出 IllegalStateTransitionError（RELEASED 状态没有任何进一步的合法转换）。（b）被引用的 B3 动账自身的 status 仍保持 RELEASED，但 presentDocsConsumedAt/presentDocsConsumedBy 此时被设置（由 B4 的释放者 'checker2' 设置）。——*余额影响：* Present Docs Earmark 只有在该 B3 提示单据被消耗（consumed）之后才会停止计入，而不仅仅是在 Released 之后。*容差/汇率：* N/A | `balanceService.test.ts:813-887` |
| Present Docs Earmark 在已 RELEASED 但尚未被消耗期间会保持全额占用——正好补上了 2026-08-18 设计变更所针对的超额占用窗口 | 一份 100,000 的 Confirmation；一笔 60,000 的 B3 提示单据（E01）已 Released，但尚未被任何 B4 消耗。 | 提交了第二笔独立的 50,000 B3 提示单据（E02）（合计 110,000 > 100,000）。 | createMovement() 会以 InsufficientBalanceError（'Present Docs amount 50000 exceeds...'）拒绝 E02。当一笔引用 E01、金额为 60,000 的 B4 HONOUR 被 Released（将 E01 标记为已消耗）之后，presentDocsEarmarkApproved 读取为 '0'。——*余额影响：* presentDocsEarmarkApproved：60,000（RELEASED，未消耗）-> 0（一旦 B4 采取行动即为已消耗）。*容差/汇率：* N/A | `balanceService.test.ts:889-939` |
| A6 的 referencedTransactionId（进口侧，IPLC_LC/UTILIZE）绝不会触发 B3 自身的消耗副作用 | 一笔 IPLC_LC Document Arrival（UTILIZE）已 Released；一笔 Acceptance CREATE 通过 referencedTransactionId 引用了它。 | 该 Acceptance CREATE 被释放。 | 不会抛出任何错误，且自动消耗的副作用（仅限于 EPLC_EXAMINATION/CREATE 范围）正确地不会去触碰这一被引用的（非 EPLC_EXAMINATION）动账。——*余额影响：* 无特定影响——证明了该副作用的类型判定范围是正确限定的。*容差/汇率：* N/A | `balanceService.test.ts:941-989` |
| 服务端 amount > 0 兜底校验——普通 ISSUE 的零值/负值会被拒绝，且拒绝后不会留下孤儿合约 | 一个全新的 naturalKey，尚无任何既有合约。 | 以 amount '0' 或 '-5000' 调用 createMovement() ISSUE。 | 两者均抛出 RequestValidationError；随后针对同一个 natural key 以 amount '10000' 重试则会成功（created: true）——证明被拒绝的尝试没有留下任何空的合约行。——*余额影响：* 拒绝时无影响。*容差/汇率：* N/A | `amountValidation.test.ts:31-90` |
| AMEND（B2）的符号豁免——负值会被当作 Decrease 方向接受，恰好为零仍会被拒绝 | 一份 EPLC_CONFIRMATION 已 Issue 并 Release。 | 分别以 amount '-2000'（会被接受）与 amount '0'（会被拒绝）调用 createMovement() AMEND。 | 负值不会抛出异常（属于合法的 Decrease 方向）；恰好为零的金额会抛出 RequestValidationError（方向判定需要一个真正非零的符号）。——*余额影响：* -2000 的 AMEND 是针对该 Confirmation ceiling 的真实减少。*容差/汇率：* 依据 tolerance.ts 自身的判定逻辑（本文件仅引用，未重新验证），AMEND 属于 LC/Confirmation ISSUE/AMEND* 中可进行容差换算的 movementType 之一。 | `amountValidation.test.ts:136-166` |
| CLOSE（A10）的金额豁免——对已全额提用的 LC，恰好为零会被接受，负值则始终被拒绝 | 一份 IPLC_LC 已 Issue，金额为 10,000，随后被全额 UTILIZE，Confirmed Balance 降至 0。 | 以 amount '0'（会被接受）调用 createMovement() CLOSE；在另一份未被全额提用的全新 LC 上，以 amount '-1'（会被拒绝）调用。 | 针对已全额提用 LC 的零金额 CLOSE 不会抛出异常；负金额的 CLOSE 会抛出 RequestValidationError。——*余额影响：* 恰好为 0 的 CLOSE 核销的是本就已为 0 的 Confirmed Balance——不会再产生任何余额变化；负数的 CLOSE 金额永远不合法。*容差/汇率：* N/A | `amountValidation.test.ts:168-211` |
