---
knowledge_id: MAKER-CHECKER-RULE-047
title: "被跳过的 release/makerSubmit 步骤不会中止业务案例其余步骤的执行"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - maker-checker
  - confirmed
---

# MAKER-CHECKER-RULE-047 — 被跳过的 release/makerSubmit 步骤不会中止业务案例其余步骤的执行

## 状态
CONFIRMED

## 业务规则
如果某个 release 或 makerSubmit 步骤自身的 movementRef 指向的是一个未返回 movementId 的 createMovement 步骤（通常是因为该步骤本身就是一个预期会失败的 expectError 案例），那么该步骤会被记录为 {skipped:true, reason}，不会发起任何 API 调用，且执行会继续进行到后续步骤，使用当前仍可获得的任何数据（例如失败响应中仍然存在的 balanceContractId）。

## 条件
在某个 release/makerSubmit 步骤执行时，captured[step.movementRef]?.response?.movementId 为假值（falsy）。

## 结果
追踪条目为 {type, label, skipped:true, reason}；循环继续执行下一步骤。

## 示例
backend/test/server.test.js 中模拟的 409 LC Issue 场景：紧随其后的 release 步骤会被跳过（不发起 fetch 调用），但该案例后续的 Amendment 步骤仍会沿用错误响应中自带的 balanceContractId（'bc-lc'）并正常成功执行。

## 验证说明
证据来源单一明确，且在两个文件中都有对应的测试引用。已确认（Confirmed）。

## 来源证据

实现：
- `backend/server.js:109-124`

测试：
- `backend/test/server.test.js:258-306`
- `backend/test/runCase.test.js:135-153`

## 相关知识
- [[Maker Checker Lifecycle]]
- 通用步骤执行器／追踪生成（runCase()）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
