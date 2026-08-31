---
knowledge_id: STATUS-RULE-031
title: "AUTO EXPIRY 是唯一能把合約狀態從 ACTIVE 轉為 EXPIRED 的路徑，僅由背景批次觸發，受 expiryDate + mailFloatGraceDays 日期閘門控管"
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

# STATUS-RULE-031 — AUTO EXPIRY 是唯一能把合約狀態從 ACTIVE 轉為 EXPIRED 的路徑，僅由背景批次觸發，受 expiryDate + mailFloatGraceDays 日期閘門控管

## Status
CONFIRMED

## Business Rule
`ContractStatus.EXPIRED` 是 F1 新增的狀態值，唯一產生它的路徑是背景批次 `runAutoExpirySweep()`（透過 `EXPIRE` movementType 的 Release 側效應 `contracts.markExpired()`）——沒有任何人工 UI 入口可以直接把一筆 ACTIVE 合約標記為 EXPIRED。`runAutoExpirySweep()` 掃描每一筆 ACTIVE 且已記錄 `expiryDate` 的根層合約（`listActiveExpirable()`，`IPLC_LC`/`EPLC_LC`/`EPLC_CONFIRMATION` 三種 instrumentType 一次查詢），逐筆以 `isPastExpiryGrace(expiryDate, mailFloatGraceDays, asOf)` 判斷是否已過「到期日 + 郵遞緩衝天數」——`mailFloatGraceDays` 依 Import/Export 分開設定（`config.ts` 的 `MAIL_FLOAT_GRACE_DAYS.IMPORT`/`EXPORT`，預設均為 5 天），且在 ISSUE 當下就一次性寫死到合約自己的欄位上（不會因日後修改 config 而回溯影響已發行的合約）。通過閘門的候選再依 [[STATUS-RULE-034]] 排除「最近剛被 Reopen」者，才真正建立並釋放一筆 `EXPIRE` movement。整個批次由 `AUTO_EXPIRY_ENABLED` 旗標獨立開關，關閉時完全不觸碰資料庫（回傳空陣列）。

## Conditions
`server.ts` 自身的 `setInterval()`（週期 `config.ts` 的 `EXPIRY_SWEEP_INTERVAL`）觸發 `service.runExpirySweepCycle()` → `runAutoExpirySweep()`；候選合約需同時滿足：狀態為 `ACTIVE`、`expiryDate` 非空、目前時間已過 `expiryDate + mailFloatGraceDays`、事件樹無未結事件、非「最近被 Reopen」。

## Result
合約狀態由 `ACTIVE` 轉為 `EXPIRED`，`effective_to` 欄位寫入本次 Release 時間；合約自身 Confirmed Balance 沖銷為 0（`EXPIRE` 帶著當下真實的正數金額）。

## Example
一筆 `expiryDate: '2025-12-30'`、`mailFloatGraceDays: 5` 的 Import LC，於 2026-01-08（已過期 + 緩衝天數）執行 `runAutoExpirySweep()` → 自動建立並釋放一筆 `EXPIRE` movement，合約狀態轉為 `EXPIRED`；若 `asOf` 仍在緩衝期內（例如 2026-01-02），則跳過不處理。

## Verification Note
已直接阅读 `microservices/balance-component/src/service/balanceService.ts` 的 `runAutoExpirySweep()`（第 811-822 行）、`domain/expiryEligibility.ts` 的 `isPastExpiryGrace()`（第 39-56 行）、`config.ts` 的 `MAIL_FLOAT_GRACE_DAYS`/`AUTO_EXPIRY_ENABLED`、store 層 `listActiveExpirable()`（第 262-271 行）與 `markExpired()`（第 374-384 行）。已由 `test/unit/service/autoExpirySweep.test.ts:227-311`（`runAutoExpirySweep` 測試群組，含「leaves one not yet past grace untouched」「Import and Export sides respect their own independently-configured grace days」「no-ops entirely when AUTO_EXPIRY_ENABLED is false」）與 `test/unit/domain/expiryEligibility.test.ts:37-61` 直接核實。

## Source Evidence

实现:
- `microservices/balance-component/src/service/balanceService.ts:811-822`
- `microservices/balance-component/src/domain/expiryEligibility.ts:39-56`
- `microservices/balance-component/src/config.ts`
- `microservices/balance-component/src/store/balanceContractStore.ts:262-271`
- `microservices/balance-component/src/store/balanceContractStore.ts:374-384`
- `microservices/balance-component/src/server.ts:18-32`

测试:
- `microservices/balance-component/test/unit/service/autoExpirySweep.test.ts:227-311`
- `microservices/balance-component/test/unit/domain/expiryEligibility.test.ts:37-61`

## Related Knowledge
- [[MOVEMENT-RULE-063]]
- [[STATUS-RULE-032]]
- [[STATUS-RULE-033]]
- [[STATUS-RULE-034]]
- [[MAKER-CHECKER-RULE-058]]
- [[auto-expiry-auto-close-background-sweep-and-grace-period]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
