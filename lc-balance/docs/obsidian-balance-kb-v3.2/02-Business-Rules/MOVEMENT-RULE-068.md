---
knowledge_id: MOVEMENT-RULE-068
title: "AMEND_EXPIRY_DATE 為雙模式 movementType：對 ACTIVE 合約是單純修改到期日，對 EXPIRED 合約則是 Expiry Extension Amendment 復原入口，由合約當前狀態而非請求旗標區分"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-26
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
- **對 EXPIRED 合約**（即「Expiry Extension Amendment」入口）：這是 EXPIRED 狀態合約唯一的復原路徑（F1 提案 §8）。因為一般的 ACTIVE-only natural-key 解析路徑（`findActiveByNaturalKey()`）找不到 EXPIRED 合約，本 movementType 是 F1 提案 §8.6 明確要求的、專屬於 EXPIRED 狀態的解析後備路徑（`findExpiredByNaturalKey()`）唯一使用者。額外要求 `hasOpenEvents === false`（§8.8，明確要求，不繼承任何既有機制的保護——這是全新解析路徑）。Release 時：重新驗證 `newExpiryDate` 仍嚴格晚於 Business Date、重新確認無未結事件，若合約自己最近一筆移動（排除本次 Amendment 自身）是 RELEASED 的 `EXPIRE`，額外產生一筆連結的 `REVERSAL` 恢復被 EXPIRE 沖銷的餘額（見 [[MOVEMENT-RULE-066]]），最後呼叫 `reactivate()` 把狀態轉回 `ACTIVE`。

## Conditions
`movementType === 'AMEND_EXPIRY_DATE'`（`service/balanceService.ts` 的 `amendExpiryDateShaped` 校驗、`resolveOrCreateContract()` 內的 EXPIRED-only 解析後備分支、`release()` 內對應分支）

## Result
同一個 movementType 依目標合約狀態產生兩種完全不同的業務效果：ACTIVE → 純欄位更新；EXPIRED → 狀態復原為 ACTIVE，可能額外產生一筆 REVERSAL。任何非 ACTIVE 非 EXPIRED 的狀態（CLOSED/CANCELLED/SUPERSEDED）一律拒絕。

## Example
一筆 ACTIVE 的 LC 提交 AMEND_EXPIRY_DATE 將到期日從 2026-12-31 延至 2027-06-30 → 只更新欄位，狀態不變，無 REVERSAL。一筆已因到期而變成 EXPIRED 的同一筆 LC，之後才發現業務上仍需展延，再次以相同的 movementType（透過 EXPIRED-only 解析路徑找到它）提交新的到期日 → Release 後狀態轉回 ACTIVE，且若該合約最近一筆是 RELEASED 的 EXPIRE，會額外產生一筆 REVERSAL 恢復其 Confirmed Balance。

## Verification Note
已直接阅读 `balance-component.model.ts` 的 `SubChoice.options[].movementTypeOverride` 機制與其文件註解（第 210-224 行一帶）；已直接阅读 `service/balanceService.ts` 的 `amendExpiryDateShaped`（第 396-416 行）、`resolveOrCreateContract()` 的 EXPIRED-only 後備解析（第 1316-1324 行）、`release()` 對應分支（第 2010-2073 行）；已直接阅读 store 層 `findExpiredByNaturalKey()`（第 199-214 行）。已由 `test/unit/service/expiryExtensionAndReopen.test.ts:47-105`（ACTIVE 純修改模式）、同檔 `:107-191`（EXPIRED-only 解析路徑）、`:192-277`（Expiry Extension Amendment 完整流程，含 REVERSAL 產生與狀態復原）直接核實。

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
