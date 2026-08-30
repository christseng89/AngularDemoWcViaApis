---
knowledge_id: STATUS-RULE-036
title: "EXPIRED 合約狀態徽標為琥珀色（明確區別於 CLOSED 的紅色），且 Checker Queue 搜尋對 A11/B7 需以 includeAnyStatus 覆寫解析，否則會 404"
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

# STATUS-RULE-036 — EXPIRED 合約狀態徽標為琥珀色（明確區別於 CLOSED 的紅色），且 Checker Queue 搜尋對 A11/B7 需以 includeAnyStatus 覆寫解析，否則會 404

## Status
CONFIRMED

## Business Rule
既有 [[STATUS-RULE-023]] 記載合約級狀態徽標配色（ACTIVE 綠色、CLOSED/CANCELLED 紅色、SUPERSEDED 灰色）。F1 為新增的 `ContractStatus.EXPIRED` 選擇了**獨立的第三種顏色**——`contractStatusBadgeClass()`（`balance-component.model.ts`）回傳 `'tb-status-badge--pending'`（琥珀色，與 PENDING 移動共用同一個色票），而非沿用 CLOSED 的紅色。設計理由：EXPIRED 是一個「日期觸發、尚未經人工最終確認」的中間狀態（尚未經 AUTO CLOSE 或 Expiry Extension Amendment 處理），與 CLOSED 這種「已由人工/批次明確終結」的終態語意不同——沿用既有「琥珀色 = 進行中/待處理」的色彩語言，比借用 CLOSED 的紅色更準確。

另一個獨立但相關的 UI 層規則：`checker-panel.component.ts` 的 Checker 搜尋邏輯對 A11/B7 這兩個功能，會把 `resolveContract()` 呼叫的 `includeAnyStatus` 參數設為 `true`（`const includeAnyStatus = !!this.selectedFunction.requiresReopenEligibility;`）——這是 A11/B7 獨有的需求：其他所有功能的 Checker 待處理 PENDING 記錄都掛在一筆 ACTIVE 合約底下（該筆移動尚未 Release，合約狀態尚未因它而改變），唯獨 A11/B7 的 PENDING REOPEN 記錄，掛在一筆**已經是 CLOSED**（尚未因這筆 REOPEN 的 Release 而改變）的合約底下——若沿用其他功能預設的 ACTIVE-only 合約解析，Checker 搜尋會直接對一筆真實存在、貨真價實 PENDING 中的 REOPEN 記錄回報「No Logical Contract exists yet for this natural key」404，此為現場測試曾實際重現的真實 bug。

## Conditions
`contractStatusBadgeClass(status)` 傳入 `status === 'EXPIRED'`；Checker 於 Checker Panel 搜尋任一 `requiresReopenEligibility` 的功能（A11/B7）

## Result
UI 對 `EXPIRED` 合約一律顯示琥珀色徽標（與 PENDING 移動共用色票），而非 CLOSED 的紅色；Checker 對 A11/B7 的搜尋會傳遞 `includeAnyStatus: true`，使 CLOSED（乃至任何狀態）的合約都能被正確解析出來以顯示其 Checker Queue。

## Example
Look Up Current Balance／Inquire Events 中顯示一筆狀態為 `EXPIRED` 的 LC，其合約級狀態徽標呈現琥珀色（與某筆仍 PENDING 的移動記錄視覺上一致），與另一筆已被 A10 CLOSE 的 LC（紅色徽標）明顯區分。Checker 在 A11 Checker Panel 輸入一筆已 CLOSED、且有一筆 REOPEN 正在等待核准的 LC Number 搜尋 → 因 `includeAnyStatus=true`，成功解析出該合約並顯示其 Checker Queue；若換成 A2 Checker Panel 搜尋同一個 LC Number（此時合約仍是 CLOSED，A2 不適用）→ 一般 ACTIVE-only 解析會正確地找不到它。

## Verification Note
已直接阅读 `src/app/transaction-builder/balance-component.model.ts` 的 `contractStatusBadgeClass()`（第 780-792 行，含完整文件註解說明「amber, not CLOSED's own red」的設計語言）；已直接阅读 `src/app/transaction-builder/checker-panel.component.ts` 第 165-188 行（`includeAnyStatus` 判斷與文件註解，含現場重現的錯誤訊息原文）。本輪未見專屬於 `contractStatusBadgeClass('EXPIRED')` 回傳值的獨立單元測試（本規則的琥珀色部分為直接閱讀原始碼核實，非測試核實）；`includeAnyStatus` 部分的行為邏輯清晰、單一職責，本輪同樣未見專屬 spec 測試檔案覆蓋 `checker-panel.component.ts` 這一小段邏輯——標記為「已讀原始碼確認，缺乏直接自動化測試覆蓋」的 CONFIRMED（原始碼本身即是最直接的證據來源，且邏輯极其簡單，誤判風險低）。

## Source Evidence

实现:
- `src/app/transaction-builder/balance-component.model.ts:780-792`
- `src/app/transaction-builder/checker-panel.component.ts:165-188`

测试:
- （未见直接测试证据，见上方验证说明）

## Related Knowledge
- [[STATUS-RULE-023]]
- [[STATUS-RULE-021]]
- [[STATUS-RULE-031]]
- [[STATUS-RULE-032]]
- [[A11-LC-Reopen]]
- [[B7-Confirmed-LC-Reopen]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
