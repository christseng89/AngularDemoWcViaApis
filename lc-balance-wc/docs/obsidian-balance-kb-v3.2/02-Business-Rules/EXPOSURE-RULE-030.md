---
knowledge_id: EXPOSURE-RULE-030
title: "ACTIVE AMEND_EXPIRY_DATE 無分錄；EXPIRED Extension 在 PENDING 即攜帶可審核的復原分錄"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance-wc)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-09-03
tags:
  - balance
  - exposure
  - f1
  - confirmed
---

# EXPOSURE-RULE-030 — ACTIVE AMEND_EXPIRY_DATE 無分錄；EXPIRED Extension 在 PENDING 即攜帶可審核的復原分錄

## Status
CONFIRMED

## Business Rule
`AMEND_EXPIRY_DATE` 依目標合約狀態分流：ACTIVE 純修改到期日仍回傳 `null`；EXPIRED Extension 若最後一筆 **RELEASED** 事件是 EXPIRE，Maker Submit 會由伺服器把原 EXPIRE 的 `ceilingAmount`、`reversalOfMovementId` 及反向 Dr/Cr `contingentAccountEntry` 寫入同一筆 PENDING Amendment。CANCELLED／REJECTED 的先前嘗試只是稽核歷史，不得遮蔽該 EXPIRE。Checker 因此在 Release/Reject 前即可審核實際恢復分錄。PENDING 不恢復 Confirmed/Available Balance；Release 才啟用同一筆 movement 的餘額效果並將合約轉回 ACTIVE，不建立第二筆 linked REVERSAL。

2026-08-25 的「兩種模式皆永遠 null、Release 另生 REVERSAL」規則已於 2026-09-03 依現場要求取代；ACTIVE 模式的 null 行為不變。

## Conditions
`movementType === 'AMEND_EXPIRY_DATE'`（`domain/contingentAccountEntry.ts` 的 `deriveContingentAccountEntry()`）

## Result
ACTIVE 模式回傳 `null`；EXPIRED Extension 回傳真實非零復原分錄，但 PENDING 時不提早恢復可用額度。

## Example
ACTIVE S01 修改日期：Amount 0、Account Entries null。EXPIRED S01 原 EXPIRE 沖銷 10,000：Maker Submit 的 Amendment 顯示反向 10,000 Dr/Cr 分錄，但 Balance 仍為 0；Checker Release 後 Balance 恢復 10,000。

## Verification Note
已依 2026-09-03 最新 source code 重新核實：`deriveContingentAccountEntry()` 只在
`AMEND_EXPIRY_DATE` 沒有 `reversedDirection`（ACTIVE 模式）時回傳 `null`；EXPIRED 模式由
`balanceService.createMovement()` 取最後一筆 RELEASED EXPIRE，帶入 reference 與 reverse direction。
`expiryExtensionAndReopen.test.ts` 的 happy path、cancelled retry 與 stale restoration basis 案例分別驗證
PENDING 即可審核分錄、CANCELLED 嘗試不遮蔽 EXPIRE，以及 Checker Release 的防禦性複查。

## Source Evidence

实现:
- `microservices/balance-component/src/domain/contingentAccountEntry.ts`（ACTIVE-null／EXPIRED reverse-direction 分流）
- `microservices/balance-component/src/service/balanceService.ts`（EXPIRED Submit 只取最後一筆 RELEASED movement）
- `microservices/balance-component/src/service/movementReleasePolicyService.ts`（Checker 複查同一 restoration basis）

测试:
- `microservices/balance-component/test/unit/service/expiryExtensionAndReopen.test.ts`（happy path、cancelled retry、stale basis）

## Related Knowledge
- [[MOVEMENT-RULE-068]]
- [[MOVEMENT-RULE-064]]
- [[MOVEMENT-RULE-067]]
- [[A11-LC-Reopen]]
- [[B7-Confirmed-LC-Reopen]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
