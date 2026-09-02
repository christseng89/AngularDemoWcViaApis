---
knowledge_id: business-case-runner-ui-single-run-vs-run-all-sequential-chain
title: 'Business Case Runner UI——单次运行 vs. 全部运行的顺序链'
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance-wc; legacy lc-balance removed)
last_verified_commit: 'N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]'
snapshot_date: 2026-09-02
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

## 2026-09-02 更新——Standalone route 可達性

`lc-balance-wc` 現為唯一維護中的 Balance UI repository，舊 `lc-balance` folder 已移除。Standalone Angular shell 的 Transaction Builder 使用空路徑；該 route 必須設定 `pathMatch: 'full'`，否則 Angular 的預設 prefix matching 會先攔截 `/business-cases`，造成點擊 Business Case Runner 後仍停留在 Transaction Builder。回歸測試固定此 route invariant，wildcard redirect 仍置於最後。

### 來源證據

- `src/app/app.routes.ts`
- `src/app/app.routes.spec.ts`

## 2026-09-02 更新——Cleanup 後的服務恢復等待

Cleanup Database 的 POST command 只發送一次，不會自動重送。Cleanup 成功後，Runner 會清除舊的單案、Run All 結果與錯誤，然後進入服務恢復等待狀態。預設每 2 秒對 `/api/business-cases` 發出一次 GET readiness probe，最多重試 15 次（約 30 秒）；該 GET 略過全域快速 retry interceptor，避免兩層 retry 疊加後造成密集 `ECONNREFUSED` log。等待期間 Run、Run All 與 Cleanup 均停用；backend 恢復後自動重載 case index，超時才顯示最終錯誤。

重試次數與間隔由 `.env` 的 `BUSINESS_CASE_RECOVERY_RETRY_COUNT` 與 `BUSINESS_CASE_RECOVERY_INTERVAL_MS` 控制。自動 polling 僅在 Cleanup 成功後啟用；Browser Refresh／初次載入只檢查一次，失敗後提供 `Try again` 手動重試，避免 backend 未啟動時持續產生 Vite proxy logs。這是 Angular/backend orchestration 運行政策，不改變 Balance microservice OAS contract。

### 來源證據

- `src/app/business-case-runner/business-case-runner.component.ts`
- `src/app/business-case-runner/balance-case-api.service.ts`
- `src/app/core/http-retry/http-retry.interceptor.ts`
- `scripts/generate-runtime-config.mjs`
- `docs/http-retry-policy.md`
