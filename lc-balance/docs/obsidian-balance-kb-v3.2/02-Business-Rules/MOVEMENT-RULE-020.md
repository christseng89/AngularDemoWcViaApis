---
knowledge_id: MOVEMENT-RULE-020
title: "A9 SG 赎回仅限 Full Redeem，金额被硬锁定为该 SG 当前的可用余额（Available Balance）"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - movement
  - confirmed
---

# MOVEMENT-RULE-020 — A9 SG 赎回仅限 Full Redeem，金额被硬锁定为该 SG 当前的可用余额（Available Balance）

## Status
CONFIRMED

## Business Rule
经业务方确认（TF_Balance_Component_Mapping 规则 #1，『SG 的解除是基于金融工具本身的，而非基于金额的』）：A9 的 Amount 字段被完全禁用，其值来源于该 SG 当前的 Available Balance（而非 Confirmed Balance——Available 会扣减同一 SG 上任何已处于 PENDING 状态的赎回，避免对已预留的额度重复计算）；通过 Angular A9 界面已无法再触达 Partial Redeem。submit-rules.ts 会硬性拒绝任何与该值不完全一致的金额，并将 movementType 硬编码为 FULL_REDEEM，作为纵深防御的兜底。amountVsAvailableDerivation='REDEEM' 在注册表中被保留，纯粹是作为 A9 的身份标记（用于父级资格提示、历史 PARTIAL_REDEEM 的回显），而非实际生效的推导选择。该限制的作用范围明确仅限于 UI 层/Angular 参考客户端——微服务自身的 PARTIAL_REDEEM movementType 与 checkRedeemSufficiency() 对任何其他直接调用接口的调用方仍然开放（checkRedeemSufficiency() 只检查 amount <= availableBalance，完全没有 businessEventId/A3S 配对检查）——这是一个已披露、但并未真正封堵的权衡取舍。

> [!info] 2026-08-26 更新：上一句描述的是 2026-08-21/22 快照时点的状态，现已过时——服务端已于 2026-08-24 收口该权衡取舍。详见下方「2026-08-26 更新」章节；本段原文按本项目的可加性修正约定予以保留，供历史对照，不作删改。

## Conditions
selectedFunction.code === 'A9'（amountVsAvailableDerivation === 'REDEEM'）

## Result
Amount 字段被锁定/禁用为 Available Balance；提交的 movementType 被硬编码为 FULL_REDEEM；任何与该值不完全一致的金额都会被硬性拒绝

## Example
availableBalance=80000，输入金额 90000 或 50000 -> 拒绝；amount=80000 -> 通过，patch.movementType='FULL_REDEEM'。示例：SG G01 开立 10,000，A3S 已赎回 2,000（仍为 PENDING 状态）-> A9 的 Amount 自动填充为 8,000，而非 10,000

## Verification Note
已直接阅读 submit-rules.ts 中的 REDEEM 分支；与声明内容完全一致。已将来自 angular-function-catalog、design-docs-figures-mapping 与 quality-remediation-history 三个不同角度、描述同一锁定机制的 5 个近似重复候选条目（包括单独的『A9 锁定依据澄清：基于 Available Balance 而非 Confirmed Balance』候选条目——它并非独立规则，而是本规则依据的最终、权威表述）合并为这一条完整的综合条目。

## 2026-08-26 更新 —— 服务端已收口（原披露的 UI-only 权衡取舍现已解除）

**状态**：本条规则原文中「该限制仅限于 UI 层，微服务自身对任何直接调用方仍然开放」的表述，业务已于 2026-08-24 确认收口——现已同时在微服务层（Maker Submit 与 Checker Release 两处）强制执行，而不再只是 Angular 参考前端一层的软约束。

**新的服务端规则**：`balanceService.ts` 的 `buildMovementTypeRegistry()` 中，`PARTIAL_REDEEM`/`FULL_REDEEM`（连同 REIMBURSE/RECLASSIFY_OUT/PARTIAL_SETTLE/FULL_SETTLE）共用的 `outstandingCapped` 充足性检查，现在会在委派给 `checkRedeemSufficiency()` 之前先做一次新增判断：若 `contract.instrumentType === 'SHGT'` 且 `req.movementType === 'PARTIAL_REDEEM'` 且请求未带 `businessEventId`，直接拒绝（Maker Submit 侧，409 `INSUFFICIENT_AVAILABLE_BALANCE`，`InsufficientBalanceError`）。`release()` 中亦镜像了完全相同的判断（Checker Release 侧，`IllegalStateTransitionError`），作为纵深防御——防止某笔movement 通过除 `createMovement()` 以外的途径到达 PENDING 状态后仍被放行。

**区分信号是 `businessEventId`，不是 movementType 字符串本身**：A3S 自身匹配到具体 Document Arrival 的 SG 赎回 leg，一律携带与其配对的 IPLC_LC UTILIZE 共享的 `businessEventId`——即便 A3S 的 MIN(单据/汇票金额, SG Outstanding) 匹配结果金额上恰好等于该 SG 的全部未偿余额，只要携带 `businessEventId`，仍被视为合法的 A3S 匹配式部分赎回，不受此门控影响（[[MOVEMENT-RULE-021]]、[[MOVEMENT-RULE-037]]）。真正被拒绝的，只是「无 `businessEventId` 的独立 `PARTIAL_REDEEM`」这一种形态——也就是原文所述、任何直接调用方绕开 Angular UI 也能提交的那种请求。一笔无 `businessEventId` 的独立 `FULL_REDEEM`（即标准 A9 提交本身）不受影响，仍照常放行。

**验证**：已直接阅读 `microservices/balance-component/src/service/balanceService.ts` 第 305-326 行（`outstandingCapped` 新增分支及其上方 2026-08-24 决策注释）与第 1907-1913 行（`release()` 内镜像的 Checker 侧再检查），以及配套的 HTTP 集成测试 `microservices/balance-component/test/unit/app.test.ts` 第 726-816 行（"A9 Full-Redeem-only server-side guard" describe 区块：无 `businessEventId` 的 Partial Redeem 在 Maker 侧 409、`code: 'INSUFFICIENT_AVAILABLE_BALANCE'`；无 `businessEventId` 的 Full Redeem 仍 201；带 `businessEventId` 的 Partial Redeem（A3S 形态）仍 201）与第 817-846 行（绕过 Maker 侧闸门后，`release()` 的镜像再检查同样以 `IllegalStateTransitionError` 拒绝）。`shgtRedeem.ts` 的 `checkRedeemSufficiency()` 纯函数本身未改动（仍只检查 `amount <= availableBalance`，不区分调用方）——新增的 `businessEventId` 判断是在 `balanceService.ts` 调用该函数之前的一道独立闸门，而非改写该函数本身。

## Source Evidence

实现:
- `src/app/transaction-builder/submit-rules.ts:116-135`
- `src/app/transaction-builder/builder-fields.ts:37-55,77-78,90-97`
- `microservices/balance-component/src/service/balanceService.ts:305-326`（Maker Submit 侧新增闸门，`outstandingCapped`）
- `microservices/balance-component/src/service/balanceService.ts:1907-1913`（Checker Release 侧镜像再检查）

测试:
- `submit-rules.spec.ts:302-340`
- `builder-fields.spec.ts:88-99`
- `microservices/balance-component/test/unit/app.test.ts:726-846`（"A9 Full-Redeem-only server-side guard"：Maker 409 无 businessEventId、Maker 201 Full Redeem、Maker 201 A3S 形态 Partial Redeem、Checker release() 镜像再检查）

## Related Knowledge
- [[BalanceMovement]]
- 金额字段锁定优先级链（builder-fields.ts）
- （TF Mapping）SG 的解除是基于金融工具本身的，而非基于金额的
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
