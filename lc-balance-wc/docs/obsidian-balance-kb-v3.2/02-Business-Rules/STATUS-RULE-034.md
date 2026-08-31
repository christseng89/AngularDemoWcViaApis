---
knowledge_id: STATUS-RULE-034
title: "isRecentlyReopened()：AUTO EXPIRY/AUTO CLOSE 均跳過最近一個掃描週期內剛被 RELEASED REOPEN 觸及的合約，時效性豁免而非永久排除"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-26
tags:
  - balance
  - status
  - f1
  - confirmed
---

# STATUS-RULE-034 — isRecentlyReopened()：AUTO EXPIRY/AUTO CLOSE 均跳過最近一個掃描週期內剛被 RELEASED REOPEN 觸及的合約，時效性豁免而非永久排除

## Status
CONFIRMED

## Business Rule
v1.21.0（2026-08-25，同日現場 UAT——「Auto Close 時必須把REOPEN狀態交易排除 不然才REOPEN 下一秒就被AUTO CLOSE掉了」／「還有AUTO EXPIRE 也把REOPEN狀態交易排除」）新增 `isRecentlyReopened(contract, asOf)`：若一筆合約自己**最新一筆**移動（依 `eventSeq` 排序）是狀態為 `RELEASED` 的 `REOPEN`，且距離該筆 REOPEN 的 `releasedAt` 不到一個完整的掃描週期（`toIntervalMs(EXPIRY_SWEEP_INTERVAL)`），則視為「最近被重啟」。`runAutoExpirySweep()`／`runAutoCloseSweep()` 都會呼叫此函式並跳過符合條件的合約。這是**時效性**豁免，不是永久排除——刻意鍵在「最新一筆移動」而非「歷史上曾經被 Reopen 過」：一旦掃描週期過去、或合約上又發生任何其他移動（Expiry Extension Amendment、一筆結算、後續真正的 EXPIRE），這個豁免就不再適用。若做成永久排除，會重新引入 F1 原始設計的一個缺口：一筆被 REOPEN 重啟為 ACTIVE、且其 `expiryDate` 當時仍在未來的合約，日後真的到期時仍必須能正常被 AUTO EXPIRY 撿走。

此機制同時涵蓋 REOPEN 可能重啟到的兩個目標狀態：ACTIVE（AUTO EXPIRY 的候選池）與 EXPIRED（AUTO CLOSE 的候選池，見 [[STATUS-RULE-032]] 情況二）——同一個輔助函式，兩個批次都呼叫。

## Conditions
`runAutoExpirySweep()` 或 `runAutoCloseSweep()` 掃描到的候選合約，其最新一筆移動為狀態 `RELEASED` 的 `REOPEN`，且 `asOf - releasedAt < toIntervalMs(EXPIRY_SWEEP_INTERVAL)`

## Result
該合約在本次掃描中被跳過（不計入 `runAutoExpirySweep()`/`runAutoCloseSweep()` 的結果陣列）；下一次掃描（或任何新移動落地後）重新正常評估。

## Example
一筆合約於 09:00:00 被 REOPEN 重啟為 `EXPIRED`（原到期日已過）。若 `EXPIRY_SWEEP_INTERVAL` 為 30 秒，AUTO CLOSE 在 09:00:01 執行的掃描會跳過它；但在 8 天後（且已通過 [[STATUS-RULE-033]] 的 Grace Period）執行的掃描會正常將其處理為 CLOSED。

## Verification Note
已直接阅读 `service/balanceService.ts` 的 `isRecentlyReopened()`（第 753-760 行，含完整文件註解說明時效性設計理由）、`runAutoExpirySweep()`（第 817 行呼叫處）、`runAutoCloseSweep()`（第 856 行呼叫處）。已由 `test/unit/service/expiryExtensionAndReopen.test.ts:888-990`（「AUTO EXPIRY/AUTO CLOSE skip a recently-Reopened contract for one sweep interval」測試群組，含 AUTO CLOSE 與 AUTO EXPIRY 兩個方向各自的豁免與到期後恢復正常處理案例）直接核實。

## Source Evidence

实现:
- `microservices/balance-component/src/service/balanceService.ts:753-760`
- `microservices/balance-component/src/service/balanceService.ts:811-822`
- `microservices/balance-component/src/service/balanceService.ts:852-859`

测试:
- `microservices/balance-component/test/unit/service/expiryExtensionAndReopen.test.ts:888-990`

## Related Knowledge
- [[STATUS-RULE-031]]
- [[STATUS-RULE-032]]
- [[STATUS-RULE-033]]
- [[MAKER-CHECKER-RULE-058]]
- [[A11-LC-Reopen]]
- [[auto-expiry-auto-close-background-sweep-and-grace-period]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
