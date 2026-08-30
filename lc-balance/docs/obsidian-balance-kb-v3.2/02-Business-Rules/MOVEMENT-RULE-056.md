---
knowledge_id: MOVEMENT-RULE-056
title: "SG 部分赎回采用 MIN(票据金额, SG 未偿余额) —— ledger.html 参考文档（仍将 A9 描述为支持 MIN() 部分赎回）与后续 A9 全额赎回锁定决策之间的 CONFLICT"
domain: Balance
category: Business Rule
status: CONFLICT
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - movement
  - conflict
---

# MOVEMENT-RULE-056 — SG 部分赎回采用 MIN(票据金额, SG 未偿余额) —— ledger.html 参考文档（仍将 A9 描述为支持 MIN() 部分赎回）与后续 A9 全额赎回锁定决策之间的 CONFLICT

## 状态
CONFLICT

## 业务规则
analysis/contingent-liability-ledger.html 自身的 Folio 2 表格中，将 A9 · FULL_REDEEM/PARTIAL_REDEEM 列为「与 A3S 自身的 SG 分支——同样源自 MIN() 的推导逻辑相同」，其自身的 Implementation Notes 小节明确指出：「Balance Component 所交付的是源文档本身反对的、基于 MIN() 的部分赎回逻辑，依据的是一项明确的、日期为 2026-08-15 的后续业务指示，推翻了原始设计……这是一项已知的、经业务确认的选择——而非疏漏。」这段描述准确对应的是 2026-08-21 之前的后端/领域层行为（checkRedeemSufficiency() 确实允许任何调用方提交 PARTIAL_REDEEM，只要不超过可用余额，且在该层不区分 A9 与 A3S）。CLAUDE.md 自身较晚（2026-08-21）的决策日志则记载，A9 随后被锁定为仅限全额赎回——但这一锁定仅发生在 Angular UI 层（submit-rules.ts 硬性锁定了 Amount/movementType）；微服务自身的 PARTIAL_REDEEM movementType 以及 shgtRedeem.ts 的 checkRedeemSufficiency() 均未改动，对于任何其他直接调用 API 的调用方，仍然接受真正的部分赎回——这是 CLAUDE.md 自身文字中已披露、尚未收口的范围局限。

## 触发条件
经由 Angular UI 发起的 A9 独立 SG 赎回，相对于由任何其他直接 API 调用方提交的、与 A9 等价的 movementType

## 结果
按 ledger.html 现有文本所述（相对 2026-08-21 的 UI 修复未标注日期）：A9 仍被描述为与 A3S 完全相同、支持 MIN() 部分赎回。按 CLAUDE.md 较晚、更具权威性的决策日志所述：Angular 参考客户端现已将 A9 锁定为仅限全额赎回；后端/微服务 API 本身则被有意保持不变，对于非 UI 调用方仍接受部分赎回。

## 示例
按 ledger.html：当 A9 赎回金额小于 SG 未偿余额时，会过账为 PARTIAL_REDEEM。按 CLAUDE.md 较晚的条目以及经直接核实的 submit-rules.ts REDEEM 分支：Angular 的 A9 画面现已将 Amount 锁定为 SG 的全部可用余额，并在客户端硬性拒绝任何非精确匹配的金额，因此经由 UI 发起的 A9 已无法再产生 PARTIAL_REDEEM——但直接的 API POST 请求仍然可以。

## 冲突说明
> [!warning] 来源存在分歧
> 本轮已分别独立核实两方立场：ledger.html 的文字经逐字核对，与所声称的内容一致；submit-rules.ts 中 A9 的锁定以及 shgtRedeem.ts 中与调用方无关的充足性检查，也经直接阅读确认无误。按原候选项的判定，这里确实应标记为 CONFLICT，不过更准确的理解是：这属于文档时效性问题（ledger.html 早于/未反映 2026-08-21 仅限 UI 层的锁定），叠加一个真实存在的两层范围拆分（UI 层已锁定，后端 API 仍开放），而非一个尚未解决的事实性矛盾——两种说法在各自所属的层级/时间点上都是成立的，CLAUDE.md 自身的记述本身已经把两者调和一致。依照指示仍保留为 CONFLICT，因为若脱离这一背景阅读，两个来源确实呈现出关于「A9 到底做什么」的实质性不同图景。

## 验证说明
本轮已分别独立核实两方立场：ledger.html 的文字经逐字核对，与所声称的内容一致；submit-rules.ts 中 A9 的锁定以及 shgtRedeem.ts 中与调用方无关的充足性检查，也经直接阅读确认无误。按原候选项的判定，这里确实应标记为 CONFLICT，不过更准确的理解是：这属于文档时效性问题（ledger.html 早于/未反映 2026-08-21 仅限 UI 层的锁定），叠加一个真实存在的两层范围拆分（UI 层已锁定，后端 API 仍开放），而非一个尚未解决的事实性矛盾——两种说法在各自所属的层级/时间点上都是成立的，CLAUDE.md 自身的记述本身已经把两者调和一致。依照指示仍保留为 CONFLICT，因为若脱离这一背景阅读，两个来源确实呈现出关于「A9 到底做什么」的实质性不同图景。

## 2026-08-26 更新 —— 两层范围拆分中的「后端 API 仍开放」一侧已于 2026-08-24 收口

本条 CONFLICT 记录原文所述的两层拆分——「UI 层已锁定，后端 API 仍对任何直接调用方开放真正的 PARTIAL_REDEEM」——中，后一半（后端 API 仍开放）现已过时。业务已于 2026-08-24 确认：`balanceService.ts` 的 `buildMovementTypeRegistry()` 现在会在 `checkRedeemSufficiency()` 之前先判断——若为 SHGT 的 `PARTIAL_REDEEM` 且请求不带 `businessEventId`，直接在 Maker Submit 阶段以 409 `INSUFFICIENT_AVAILABLE_BALANCE` 拒绝；`release()` 亦镜像同一判断，作为 Checker 侧的纵深防御。完整的服务端实现与测试证据见 [[MOVEMENT-RULE-020]] 的「2026-08-26 更新」章节。

这**并未使本条 CONFLICT 记录整体失效**，而是让它更明确地成为一份「文档时效性」记录，而非仍然成立的范围拆分：
- `analysis/contingent-liability-ledger.html` 自身的文字仍描述 A9 支持 MIN() 部分赎回——对应的是 2026-08-15 之前的行为，此点未变，本条记录关于该文档过时性的判断仍然成立。
- `balance-component-channel-api.yaml` 第 925 行自身对 A9 `compoundLegs` 的描述文字（`FULL_REDEEM | PARTIAL_REDEEM (server-derived from amount vs. Available Balance)`）同样仍是 2026-08-21 锁定决策之前的旧文字，尚未同步更新（见 [[A9-SG-Redemption]] 自身记录的 CONFLICT）。
- 唯一被本次更新推翻的，是原记录中「后端/微服务 API 本身则被有意保持不变，对于非 UI 调用方仍接受部分赎回」这一句——该权衡取舍已不再成立：无 `businessEventId` 的独立 Partial Redeem 现在无论经由 UI 还是任何直接 API 调用方，均会被拒绝。A3S 自身携带 `businessEventId` 的匹配式 Partial Redeem 不受影响，仍按 MIN(单据/汇票金额, SG Outstanding) 正常放行——这也是 ledger.html／channel API 文字与当前实现之间实质性分歧进一步缩小（但未完全消除，仍有上述两处规范文字未同步更新）的部分。

**验证**：已直接阅读 `balanceService.ts` 第 305-326 行、第 1907-1913 行，以及 `microservices/balance-component/test/unit/app.test.ts` 第 726-846 行的 HTTP 集成测试（覆盖 Maker 拒绝无 businessEventId 的 Partial Redeem、Maker 接受标准 Full Redeem、Maker 接受 A3S 形态的匹配式 Partial Redeem、Checker release() 的镜像再检查）。`shgtRedeem.ts` 的 `checkRedeemSufficiency()` 纯函数本身未改动。

## 来源证据

实现:
- `analysis/contingent-liability-ledger.html Folio 2 table + Implementation Notes section (verified verbatim, footnote 8 text)`
- `src/app/transaction-builder/submit-rules.ts:116-135 (directly verified A9 lock in this pass)`
- `microservices/balance-component/src/domain/shgtRedeem.ts (directly verified — checkRedeemSufficiency has no A9-vs-A3S/businessEventId distinction, still accepts any partial ≤ available)`
- `microservices/balance-component/src/service/balanceService.ts:305-326`（2026-08-24 新增：Maker Submit 侧 businessEventId 闸门，直接阅读核实）
- `microservices/balance-component/src/service/balanceService.ts:1907-1913`（2026-08-24 新增：Checker Release 侧镜像再检查，直接阅读核实）

测试:
- `microservices/balance-component/test/unit/app.test.ts:726-846`（"A9 Full-Redeem-only server-side guard" describe 区块，直接阅读核实）

## 相关知识
- [[BalanceMovement]]
- [[Business-Rule-Index]]
- [[Knowledge-Gaps]]
- [[Balance-Traceability-Matrix]]
