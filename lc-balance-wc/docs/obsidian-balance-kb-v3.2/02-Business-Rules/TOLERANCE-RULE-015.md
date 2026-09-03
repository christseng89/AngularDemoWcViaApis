---
knowledge_id: TOLERANCE-RULE-015
title: "A2／B2 以修改前后完整上限差额入账，并在 Checker Release 才启用新 Tolerance"
domain: Balance
category: Business Rule
status: CONFIRMED
snapshot_date: 2026-09-03
tags:
  - balance
  - tolerance
  - amendment
---

# TOLERANCE-RULE-015 — A2／B2 完整上限差额

## 业务规则

A2／B2 的 Amount Increase／Decrease 与 Tolerance Increase／Decrease 必须使用同一通用公式：分别计算
修改前与修改后的完整 LC／Confirmation 上限，并把两者差额作为 movement exposure。旧／新上限均先依
交易币别小数位采用 `ROUND_HALF_UP`。新 Tolerance 在 Maker Submit 时只属于 PENDING movement，Checker
Release 成功后才成为 contract 当前值；Release 必须依最新 RELEASED history 重算并拒绝 stale 基准。

Maker 可只改 Amount、只改 Tolerance，或两者同改。Tolerance-only 的 API Amount 为 `"0"`，此时
`newFace = oldFace`，但新旧完整上限差仍会产生 Balance Effect。Amount 为 0 且 Tolerance 未输入或未改变
是 no-op，客户端与服务端都必须拒绝。

`AMEND_EXPIRY_DATE` 不属于 monetary amendment，也不接受 Tolerance。外部 request 的金额固定为 0；ACTIVE
目标的 persisted movement 仍为 0。EXPIRED 目标可由服务端改写为受保护的 EXPIRE 恢复金额，但这是生命周期
恢复而非 Face Amount／Tolerance amendment，不进入本规则的上限差额公式。

Standard Fix Pending 保存后必须立即以修正后的 movement 重算并覆写持久化 Event Snapshot，不得保留
修改前快照等到 Checker Release。UI 应分别显示 amendment 自己的 tolerance-adjusted balance effect、
Tolerance 旧值→提案值，以及同一合约所有 PENDING movement 的净 `Pending Earmark Total`。RELEASED
事件的旧 Tolerance 必须从按序 RELEASED history 推导，例如 Decrease 显示 `20% → 15%`。

## 公式

`delta = round(newFace × (1 + newTolerance/100)) - round(oldFace × (1 + oldTolerance/100))`

## UCP／ICC 边界

UCP 600 Article 10 的 amendment consent 是上游 Trade Finance workflow 条件；本规则只定义 Balance
Component 内金额／Tolerance 何时入账。Article 30(a) amount tolerance 可影响上限，Article 30(b)
quantity tolerance 不得进入本公式。

## 来源证据

- `microservices/balance-component/src/domain/tolerance.ts`
- `microservices/balance-component/src/service/balanceService.ts`
- `microservices/balance-component/src/service/movementReleaseSideEffectService.ts`
- `microservices/balance-component/test/unit/domain/tolerance.test.ts`
- `microservices/balance-component/test/unit/app.test.ts`
- `microservices/balance-component/test/unit/service/movementRequestValidator.test.ts`
- `microservices/balance-component/test/unit/service/balanceService.test.ts`
- `src/app/transaction-builder/submit-rules.spec.ts`
- `backend/data/businessCases.js` (`import-case-16`, `export-case-15`)

## 相关知识

- [[Tolerance Processing]]
- [[Freshness-Update-Log-2026-09-03]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
