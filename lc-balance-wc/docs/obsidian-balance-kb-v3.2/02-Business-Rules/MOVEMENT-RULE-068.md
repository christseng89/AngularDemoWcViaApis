---
knowledge_id: MOVEMENT-RULE-068
title: "AMEND_EXPIRY_DATE 為雙模式 movementType：對 ACTIVE 合約是單純修改到期日，對 EXPIRED 合約則是 Expiry Extension Amendment 復原入口，由合約當前狀態而非請求旗標區分"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-09-03
tags:
  - balance
  - movement
  - f1
  - confirmed
---

# MOVEMENT-RULE-068 — AMEND_EXPIRY_DATE 為雙模式 movementType：對 ACTIVE 合約是單純修改到期日，對 EXPIRED 合約則是 Expiry Extension Amendment 復原入口，由合約當前狀態而非請求旗標區分

## Status
CONFIRMED

## Business Rule
`AMEND_EXPIRY_DATE` 是 A2/B2「Amendment」功能新增的第三個 subChoice 選項（與既有的 AMEND_INCREASE/AMEND_DECREASE 並列），本身是一個獨立的 movementType（而非 amendDirection 的一種變體——沒有 Increase/Decrease 兩個方向），提交時直接把 `model.movementType` 設為這個值，繞過 B2 其他兩個選項使用的 `amendDirection` 間接寫入機制。其行為依**目標合約當下的實際狀態**分為兩種模式，而不是由請求中的任何旗標決定：
- **對 ACTIVE 合約**：純粹的到期日修改——只更新 `expiryDate` 欄位，不改變合約狀態，不產生任何 REVERSAL，`contingentAccountEntry` 為 `null`（見 [[EXPOSURE-RULE-030]]）。
- **對 EXPIRED 合約**（即「Expiry Extension Amendment」入口）：這是 EXPIRED 狀態合約唯一的復原路徑。Maker catalog 同時查 ACTIVE/EXPIRED，Checker 也以跨狀態 resolver 找到 PENDING。若最後一筆 RELEASED movement 為 EXPIRE，Maker Submit 即把受保護的復原金額、原 EXPIRE reference 與真實 Account Entries 寫在同一筆 PENDING Amendment 供審核；CANCELLED／REJECTED 的舊嘗試不影響此判斷，餘額此時仍不恢復。Release 以相同規則重新驗證日期、未結事件與復原 basis，然後由同一筆已審 movement 恢復餘額並 `reactivate()`，不額外產生 REVERSAL。

## Conditions
`movementType === 'AMEND_EXPIRY_DATE'`（`service/balanceService.ts` 的 `amendExpiryDateShaped` 校驗、`resolveOrCreateContract()` 內的 EXPIRED-only 解析後備分支、`release()` 內對應分支）

## Result
同一個 movementType 依目標狀態分為 ACTIVE 純欄位更新，以及 EXPIRED 單筆、先審分錄再恢復的 Extension。任何非 ACTIVE 非 EXPIRED 狀態一律拒絕。

## Example
一筆 ACTIVE 的 LC 提交 AMEND_EXPIRY_DATE 將到期日從 2026-12-31 延至 2027-06-30 → 只更新欄位，狀態不變，無 Account Entries。若 LC 已因到期變成 EXPIRED，Maker Submit 時同一筆 PENDING Amendment 即帶原 EXPIRE 金額的反向 Account Entries；Checker Release 後該筆自身恢復 Confirmed Balance 並轉回 ACTIVE，不額外產生 REVERSAL。

## Verification Note
已直接閱讀 Maker/Checker catalog 與跨狀態解析、`balanceService.ts`、`balanceDerivation.ts`、`contingentAccountEntry.ts`、Release Policy/Side Effect。`expiryExtensionAndReopen.test.ts` 直接覆蓋 ACTIVE 純修改、EXPIRED-only 解析、PENDING 分錄、Release 恢復及無額外 REVERSAL。

## Source Evidence

实现:
- `src/app/transaction-builder/balance-component.model.ts:210-224`
- `microservices/balance-component/src/service/balanceService.ts:396-416`
- `microservices/balance-component/src/service/balanceService.ts:1316-1324`
- `microservices/balance-component/src/service/balanceService.ts:2010-2073`
- `microservices/balance-component/src/store/balanceContractStore.ts:199-214`

测试:
- `microservices/balance-component/test/unit/service/expiryExtensionAndReopen.test.ts:47-105`
- `microservices/balance-component/test/unit/service/expiryExtensionAndReopen.test.ts:107-191`
- `microservices/balance-component/test/unit/service/expiryExtensionAndReopen.test.ts:192-277`

## Related Knowledge
- [[MOVEMENT-RULE-066]]
- [[EXPOSURE-RULE-030]]
- [[STATUS-RULE-035]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
