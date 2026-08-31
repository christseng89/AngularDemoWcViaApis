---
knowledge_id: EXPOSURE-RULE-004
title: "新的交单呈现（B3 EPLC_EXAMINATION CREATE）充足性检查——严格限定在父 Confirmation 经交单占用额调整后的严格可用余额之内，不享有临时消耗抵扣"
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

# EXPOSURE-RULE-004 — 新的交单呈现（B3 EPLC_EXAMINATION CREATE）充足性检查——严格限定在父 Confirmation 经交单占用额调整后的严格可用余额之内，不享有临时消耗抵扣

## 状态
CONFIRMED

## 业务规则
一笔全新 B3 交单呈现所请求的 ceiling 金额，不得超过 parentConfirmedBalance − parentPendingDecreaseTotal − presentDocsEarmark，其中 presentDocsEarmark = computePresentDocsEarmark() 汇总的所有其他仍为 PENDING 或已 RELEASED 但尚未被消耗的 EPLC_EXAMINATION CREATE。checkNewPresentDocsSufficiency() 刻意保持严格——它绝不会套用 derivePresentDocsProvisionallyConsumedIds() 的抵扣逻辑——因为一笔真正全新、独立的呈现绝不能依赖另一笔尚未获批的 B4 只是"临时"（尚未真正）释放出的额度。此项检查在合约创建之前完成，与 SG Issue 上限检查遵循相同的先后顺序原则。

## 触发条件
requestedAmount > tightAvailable，其中 tightAvailable = parentConfirmedBalance − parentPendingDecreaseTotal − presentDocsEarmark（严格计算，不为任何 B4 的临时消耗做抵扣）。

## 结果
409 错误，其中指明该 Confirmation 的 balanceContractId 及确切的差额（当占用额本身已超过已确认余额时，该值可以为负数）。

## 示例
parentConfirmedBalance=100000，presentDocsEarmark=120000（E01+E02 已未偿）→ tightAvailable=-20000 → 任何新的 E03 呈现都会被拒绝。真实案例：一笔 60,000 的 B3 呈现已 RELEASED 但尚未消耗，针对一笔 100,000 的 Confirmation；第二笔独立的 50,000 呈现即便第一笔在技术上已获批，仍会被拒绝（110,000 > 100,000）。

## 验证说明
合并了四个相互重叠的候选项（风险敞口域的 checkPresentDocsIssueSufficiency、routes-api-e2e 的端到端实测版本、balance-service-orchestration 的"严格，不享受临时抵扣"表述，以及 api-specs 的 OAS 描述）为一条规则。通过直接阅读 balanceService.ts 中的 checkNewPresentDocsSufficiency() 得到验证，确认它确实没有调用 derivePresentDocsProvisionallyConsumedIds()——"严格"这一论断成立。routes-api-e2e 候选项自身引用的示例（E001/E04 CU02）场景略有不同（单笔呈现对比 Available，是一个更早、更简单的情形），但测试的是同一底层检查；没有冲突，作为佐证性的端到端证据一并纳入。

## 来源证据

实现:
- `microservices/balance-component/src/domain/offBalanceExposure.ts:191-218, 152-186 (verified read)`
- `microservices/balance-component/src/service/balanceService.ts:361-396 (checkNewPresentDocsSufficiency, verified read: confirms strict posture, no provisionallyConsumedIds derivation used here)`

测试:
- `microservices/balance-component/test/unit/domain/offBalanceExposure.test.ts:250-297`
- `microservices/balance-component/test/unit/app.test.ts:1490-1626 (E2E, Present Docs vs. parent Confirmation Available)`
- `backend/... businessCases.test.js (Case #6/#7 acknowledge coverage)`

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- 交单占用额生命周期：Pending → Approved → Consumed
- B3 真实释放重设计（presentDocsConsumedAt）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
