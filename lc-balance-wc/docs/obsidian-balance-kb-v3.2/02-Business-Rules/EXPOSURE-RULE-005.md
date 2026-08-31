---
knowledge_id: EXPOSURE-RULE-005
title: "B4 仍处于 PENDING 状态的 HONOUR/ACCEPT 会临时抵扣其所引用的 B3 呈现——仅用于展示，且仅存在于 assembleSnapshot() 内部"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - exposure
  - confirmed
---

# EXPOSURE-RULE-005 — B4 仍处于 PENDING 状态的 HONOUR/ACCEPT 会临时抵扣其所引用的 B3 呈现——仅用于展示，且仅存在于 assembleSnapshot() 内部

## 状态
CONFIRMED

## 业务规则
derivePresentDocsProvisionallyConsumedIds() 会从某个 Confirmation 自身的变动记录列表中，推导出所有当前仍为 PENDING 状态（已由 Maker 提交，尚未经 Checker Release）的 HONOUR/ACCEPT 已经引用的 referencedTransactionId 集合。assembleSnapshot() 是唯一接入这一集合的调用点，它将该集合传给 computePresentDocsEarmark()/computePresentDocsEarmarkApproved()，从而自 B4 被 Submit 起——早于 B4 自身在 Release 时才真正触发的 markPresentDocsConsumed() 副作用之前——就将这些 B3 记录从实时/持久化的 tightAvailableBalance 与 presentDocsEarmarkApproved 指标中排除。而每一处 createMovement() 时刻的充足性检查（一笔全新 B3 自身的检查，以及 B2/A2 的 AMEND_DECREASE 形态检查）都始终保持严格，绝不享受这一抵扣——只有读取/展示路径才会受益。

## 触发条件
一笔当前仍为 PENDING 状态的 B4（HONOUR/ACCEPT）变动记录，其 referencedTransactionId 指向同一 Confirmation 上一条已 RELEASED 的 B3（EPLC_EXAMINATION CREATE）记录。

## 结果
presentDocsEarmarkApproved 与 tightAvailableBalance 从 B4 自身 Submit 起就立即反映出这一抵扣（仅限读取/展示）；在同一时间窗口内提交的另一笔真正全新、无关的 B3 呈现，仍然会按照严格、未抵扣的数值进行检查。

## 示例
U02 LC：B1 Confirm 10,000 Usance Approved → B3 Present Docs 10,000 Approved → B4 Acceptance 10,000 Submit（PENDING）。实时余额会立即读取到 presentDocsEarmarkApproved 0 / tightAvailableBalance 0 / pendingEarmarkTotal -10000，而非重复计算；此后提交的一笔无关的新 B3 呈现，仍会正确地按照严格的 -10000 数值被拒绝。

## 验证说明
合并了四个相互重叠的候选项（风险敞口域的 derivePresentDocsProvisionallyConsumedIds、balance-service-orchestration 对 assembleSnapshot 的描述、design-docs-figures-mapping 的"B4 在 Submit 时即抵扣"规则，以及 api-specs 的 v1.15.0 更新日志条目）为一条规则。直接阅读了该领域函数及其在 balanceService.ts 中的调用点，确认 assembleSnapshot() 确实是唯一的接入点，且两处 createMovement() 时刻的检查确实保持严格——代码、OAS 与设计文档之间没有分歧。没有找到针对该函数本身的专门单元测试证据（offBalanceExposure.test.ts 中的行号范围覆盖的是拆分后的占用额函数，无法确认专门测试了这一函数）——凭借对代码的直接、明确阅读，以及现场验证的业务决策日志条目，维持 CONFIRMED，不降级为 INFERRED，因为代码本身是明确且经过完整阅读的。

## 来源证据

实现:
- `microservices/balance-component/src/domain/offBalanceExposure.ts:130-186, 244-251 (verified read)`
- `microservices/balance-component/src/service/balanceService.ts:609-632 (assembleSnapshot's EPLC_CONFIRMATION block, verified read — confirms this is the ONLY call site using provisionallyConsumedIds) and :271-277 (checkDecreaseShapedSufficiency's own deliberately-strict EPLC_CONFIRMATION branch, verified read)`

测试:
- （未引用直接测试证据）

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- B3 → B4 交单占用额临时抵扣
- B3 真实释放重设计（presentDocsConsumedAt）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
