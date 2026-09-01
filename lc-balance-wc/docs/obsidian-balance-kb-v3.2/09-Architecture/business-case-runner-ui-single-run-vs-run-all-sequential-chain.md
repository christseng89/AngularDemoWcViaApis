---
knowledge_id: business-case-runner-ui-single-run-vs-run-all-sequential-chain
title: 'Business Case Runner UI——单次运行 vs. 全部运行的顺序链'
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: 'N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]'
snapshot_date: 2026-09-01
tags:
  - balance
  - domain-concept
---

# Business Case Runner UI——单次运行 vs. 全部运行的顺序链

BusinessCaseRunnerComponent 的 run() 只执行当前选中的这一个用例；runAll() 则通过一个递归的 next() 回调，按顺序逐一耗尽完整的用例列表（必须等前一个用例的 HTTP 响应返回后，下一个用例才会开始），而不是并发触发所有用例——每完成一个用例，就把结果累积进 allResults[]，并在遇到第一个错误时中止后续链路。

## 证据来源

- `src/app/business-case-runner/business-case-runner.component.ts:58-97`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]

## 2026-08-26 更新——"Run All 10 Cases" 按钮文案更正

模板中原按钮文案 "Run All 10 Cases" 已更正为 "Run All Cases"——登记表规模早已超过 10 个用例（截至本次核实为 29 个，见 [[declarative-business-case-registry-businesscases-js]]），旧文案已经过期。运行中显示 "Running all…"；run()/runAll() 的递归顺序链逻辑本身未变。此修正是同日 "Run All Cases" 500 错误三重根因修复（见 [[rate-limiter-false-positive-artifact-when-business-cases-are-run-back-]]）的附带项。

### 证据来源（本次更新）

- `src/app/business-case-runner/business-case-runner.component.html:20`

## 2026-08-30 更新——保留下游手工测试前置交易

Run All 仍依序执行案例。2026-09-01 起，最后六个 readiness cases 各建立一个母 LC／Confirmation，并在同一母契约下保留三笔尚未被下游消费且符合状态条件的子交易，供 A3S、A4、A6、A7、B4、B5 使用。此规则不放宽任何 Index eligibility；它验证 Balance Component 对同一 LC 多笔 secondary references 与独立 lifecycle status 的支持。

Case 执行若发现 Tight LC Balance 小于 0，会自动透过现有 API 建立并放行 Import A02 或 Export B02 后重新验证。Cleanup Database 成功会清除单案结果、Run All 结果与旧错误。当前 registry 与整合基准为 35 cases。

### 来源证据

- `backend/data/businessCases.js`
- `backend/server.js`
- `backend/test/businessCases.test.js`
- `backend/test/runCase.test.js`
- `analysis/Balance-Component-Test-Case-Proposal.md`
