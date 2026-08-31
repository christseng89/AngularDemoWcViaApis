---
knowledge_id: MOVEMENT-RULE-077
title: "任一创设型 movement 的 naturalKey.lcNumber 强制必填——服务端 assertNaturalKeyFieldsRequired()，Maker+Checker 双重校验"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-26
tags:
  - balance
  - movement
  - confirmed
  - natural-key
  - maker-checker
---

# MOVEMENT-RULE-077 — 任一创设型 movement 的 naturalKey.lcNumber 强制必填——服务端 assertNaturalKeyFieldsRequired()，Maker+Checker 双重校验

## Status
CONFIRMED

## Business Rule
2026-08-26 用户直接指示（"UI必输栏位 API也是必输栏位 三者一体"）：Angular 客户端早已在 `submit-rules.ts` 中阻挡空白 `naturalKey.lcNumber` 的提交（"LC Number is mandatory."／"Pick the Parent LC first..."两种文案，依 A1/B1 自由输入 vs. A6/A8/B4 经 Parent 选取器带入两种路径分流），但在本次修复之前，服务端本身完全没有对应校验——任何绕过前端、直接呼叫 API 的调用方仍可用空白/缺失的 `lcNumber` 建立一笔合约。`assertNaturalKeyFieldsRequired()` 补上此缺口：只要该 `movementType` 属于「创设型」（`this.movementTypeRegistry[req.movementType]?.isCreating` 为真，即 ISSUE/CREATE 一类）且请求确实带有 `req.naturalKey`（区别于直接以 `balanceContractId` 定位既有合约的路径——那条路径与自然键完全无关，不受此规则约束），则无条件要求 `naturalKey.lcNumber` 非空，不因 instrumentType 而异。此为纵深防御的第一层判断，其后才依 instrumentType 检查 `ibNumber`/`sgNumber` 是否额外必填（见 [[MOVEMENT-RULE-078]]）。

同一规则在 Checker `release()` 中原样复检一次，但复检对象是**已持久化在合约上的 `contract.naturalKey.lcNumber`**，而非本次请求的 `req.naturalKey`——因为 `naturalKey` 是在合约创设当下就固定写死的字段，之后任何其他 movementType 的 release() 都不会、也不需要重新检查它，只有「本身即创设该合约」的那笔 movement（`this.movementTypeRegistry[movement.movementType]?.isCreating`）自己的 release() 才会检查。此复检的唯一现实触发场景是合约经由绕过 `createMovement()` 的路径（例如直接写库）产生，`createMovement()` 自身正常路径下这里永远不会真正触发。

## Conditions
`this.movementTypeRegistry[req.movementType]?.isCreating === true && req.naturalKey` 存在 且 `!req.naturalKey.lcNumber`（createMovement 端）；`this.movementTypeRegistry[movement.movementType]?.isCreating === true && !contract.naturalKey.lcNumber`（release 端，对照已持久化合约）

## Result
`400 RequestValidationError`："naturalKey.lcNumber is required for ${movementType} against ${instrumentType}."

## Example
- `IPLC_LC`／`ISSUE`（A1），`naturalKey: { lcNumber: '' }` → 拒绝。
- 已用 `balanceContractId` 定位既有合约的 `AMEND_INCREASE` 请求（未带 `naturalKey`）→ 完全不受本规则约束，通过。
- 一笔已建立的合约被直接写库将 `lc_number` 清空后再对其 `ISSUE` movement 呼叫 `release()` → Checker 端复检同样拒绝。

## Verification Note
已直接阅读 `balanceService.ts:1524-1543`（`assertNaturalKeyFieldsRequired()` 本体与其上方决策脉络说明）及 `release()` 内对应复检段（第 1761-1764 行）；已完整阅读专门为此新增的测试档 `mandatoryFieldRules.test.ts`（全档 343 行）中「naturalKey fields mandatory on a creating movement (rule 1-3)」describe 区块的全部 7 个测试案例，含明确验证「经 `balanceContractId` 解析的 movement 从不受此规则约束」与「Checker release() 对写库绕过的 lcNumber 缺陷做纵深防御复检」两个边界案例。已核实 Angular 端对应镜像 `submit-rules.ts:116-122`。

## Source Evidence

实现:
- `microservices/balance-component/src/service/balanceService.ts:1524-1543`（`assertNaturalKeyFieldsRequired()`）
- `microservices/balance-component/src/service/balanceService.ts:1761-1764`（release() 复检段）
- `src/app/transaction-builder/submit-rules.ts:116-122`（Angular 端镜像：Parent 带入路径 vs. 自由输入路径）

测试:
- `microservices/balance-component/test/unit/service/mandatoryFieldRules.test.ts:30-141`（"naturalKey fields mandatory on a creating movement (rule 1-3)" 全部案例，含 lcNumber 专属的第 31-47、104-121 行两个测试）
- `src/app/transaction-builder/submit-rules.spec.ts:151`（"LC Number is mandatory." 断言）

## Related Knowledge
- [[MOVEMENT-RULE-078]] — naturalKey.ibNumber/sgNumber 按 instrumentType 额外必填（同一函式的第二段检查）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
