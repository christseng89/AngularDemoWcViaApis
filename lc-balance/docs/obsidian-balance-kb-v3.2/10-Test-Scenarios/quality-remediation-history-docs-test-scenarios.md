---
knowledge_id: quality-remediation-history-docs-test-scenarios
title: "质量/整改历史文档 测试场景"
domain: Balance
category: Test Scenarios
snapshot_date: 2026-08-22
tags:
  - balance
  - test-scenario
---

# 质量/整改历史文档 测试场景

从本主题范围的测试文件中提取了8个测试场景。这些场景所证明的规则详见 Quality/Remediation History Docs 与 [[Business-Rule-Index]]。

| 场景 | 前置条件（Given） | 触发操作（When） | 预期结果（Then） | 来源 |
|---|---|---|---|---|
| import-case-11 ——SG 余额仍未结清时，A10 Close 会被阻止 | 一份 Import LC（IPLC_LC）有一笔 30,000 的 SG Issue（A8），从未被赎回。 | 针对该 LC 尝试 A10 Close。 | 返回 409 INSUFFICIENT_AVAILABLE_BALANCE；此后 LC 的快照仍显示 Confirmed 100,000 / ACTIVE，SG 仍为 30,000——被拒绝的 Close 从未生效。 | `Balance-Component-New-Test-Cases-Verification-2026-08-21.md:37` |
| import-case-12 ——Acceptance 余额仍未结清时，A10 Close 会被阻止 | 一份 Import Sellers Usance LC 有 50,000 的 A6 Acceptance Liability，从未结清（A7 从未运行）。 | 尝试 A10 Close。 | 返回 409 INSUFFICIENT_AVAILABLE_BALANCE，报错信息为 'Cannot Close IPLC_LC ... — Acceptance Balance must be 0 (currently 50000) — settle the Acceptance first (A7/B5).'；尝试后的快照显示：LC 仍为 Confirmed 50,000，Acceptance Liability 仍为 50,000，合约仍为 ACTIVE。——*余额影响：* 无——被拒绝的 Close 对 LC 与 Acceptance 两本账本均完全无效。 | `Balance-Component-Import-Case-12-Verification-2026-08-22.md:38-54` |
| export-case-11 ——Acceptance Liability 仍未结清时，B6 Close 会被阻止（同一关卡的出口侧） | 一份 Export Confirmed LC（Sellers Usance）有一个 B4 Accept 步骤，创建了 10,000 的 Acceptance Liability，从未结清。 | 尝试 B6 Close。 | 返回 409 INSUFFICIENT_AVAILABLE_BALANCE，报错为 'Cannot Close EPLC_CONFIRMATION ... — Acceptance Balance must be 0 (currently 10000) — settle the Acceptance first (A7/B5).'；尝试后的快照显示：CONF LIAB 仍为 90,000（ACTIVE，未 CLOSED），Acceptance Liability 仍为 10,000。 | `Balance-Component-Export-Case-11-Verification-2026-08-22.md:38-49` |
| import-case-10 ——Sight 完整生命周期直至 Close，独立的 A9 与 Document Arrival 相互独立地进行赎回 | A1 Issue（Sight）→ A8 SG Issue → A3（不匹配）Document Arrival → 真实的 A4 Maker-Submit + Release。 | 针对该 SG 提交并释放独立的 A9 FULL_REDEEM，随后针对该 LC 提交并释放 A10 Close。 | 依据设计，SG 独立于该（不匹配的）Document Arrival 赎回至 0；随后 A10 Close 将剩余的 60,000 Confirmed Balance 恰好核销至 0，合约状态变为 CLOSED。 | `Balance-Component-New-Test-Cases-Verification-2026-08-21.md:36` |
| export-case-10 ——独立的 B2 Amendment：增加成功应用，超出 Tight Available 的减少被正确拒绝 | 经过 B1 Confirm 之后的 Export Confirmed LC。 | 提交并释放一笔 +20,000 的 B2 Amendment 增加，随后针对由此产生的 120,000 Tight Available Balance，尝试一笔 −130,000 的 B2 Amendment 减少。 | 增加干净地应用成功（余额达到 120,000）；减少则通过 checkAmendDecreaseSufficiency 被拒绝，返回 409 INSUFFICIENT_AVAILABLE_BALANCE；校验后的快照确认余额仍保持 120,000，未变化。——*容差/汇率：* 无——容差换算适用于 LC/Confirmation 的 ISSUE/AMEND，但本场景测试的是充分性校验关卡，而非容差运算本身。 | `Balance-Component-New-Test-Cases-Verification-2026-08-21.md:40` |
| export-case-2 / export-case-4 的 tenorType 修正——由 BUYERS_USANCE 改为 SELLERS_USANCE 不影响行为 | 两条既有的 Business Case Registry 条目，此前在 EPLC_CONFIRMATION / EPLC_LC 合约上声明了 tenorType: 'BUYERS_USANCE'（依据 Decision 2，业务上无效）。 | tenorType 被修正为 SELLERS_USANCE（而非 SIGHT，以保留 ACCEPT/Acceptance 组合测试路径），并对两个案例进行了实时重跑。 | export-case-2 的 Present Docs 步骤仍解析为 movementType ACCEPT（而非 HONOUR），并以 exposureNature ACTUAL 创建 Acceptance CREATE；export-case-4 的 Issuing Bank Accept 步骤仍解析为 exposureNature MEMO 的 CREATE——每一个 movementType、exposureNature 以及余额数字均与修复前逐字节一致，证实这纯粹是一次标注错误的修正。 | `Balance-Component-Export-Case-2-4-Tenor-Fix-Verification-2026-08-22.md:45-60` |
| BAL-123 ——在未经过真实 Maker Submit 的情况下，Sight UTILIZE 的 release 会被阻止；Usance UTILIZE 不受影响 | 一笔 IPLC_LC/UTILIZE 动账，其父合约 tenorType 为 SIGHT，动账处于 PENDING 状态，makerSubmittedAt 仍为 null。 | 尝试直接针对微服务发起 Checker Release（绕过 Angular 客户端的关卡）。 | 服务端返回 409——Maker/Checker 的四眼原则控制是真正由服务端强制执行的关卡，而不仅仅是 UI 层面的约定。通过 A6 自身组合流程释放的 Usance tenor UTILIZE（该流程从不调用 maker-submit）不受这一相同检查的影响。 | `Quality-report-balance.md:300-320 — 4 new dedicated microservice tests plus live verification across all 14 Business Case Registry entries` |
| BAL-115 ——格式错误的货币金额会在服务层被拒绝，而不仅仅是在 HTTP 路由层 | 调用方直接调用 BalanceService.createMovement()（绕过 routes/balanceMovements.ts 自身的路由层校验），提供的 amount 字符串带有超过 3 位小数、指数记法，或带有前导 '+' 号。 | 服务尝试基于该金额构造一个 Decimal，用于 SG-Issue-cap / Present-Docs-earmark / AMEND_DECREASE 的充分性运算。 | 通过 parseMonetaryAmount() 抛出 InvalidMonetaryAmountError，而不是让格式错误的值静默地进入业务关键运算，或持久化到 BalanceMovement.ceilingAmount。 | `Quality-report-balance.md:409-424 — 3 new unit tests, one per formerly-bypassing call site` |
