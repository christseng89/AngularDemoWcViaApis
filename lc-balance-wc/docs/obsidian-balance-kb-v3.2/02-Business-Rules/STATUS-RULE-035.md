---
knowledge_id: STATUS-RULE-035
title: "findExpiredByNaturalKey()／findClosedByNaturalKey()：僅 AMEND_EXPIRY_DATE／REOPEN 擁有專屬的非 ACTIVE 合約 natural-key 解析後備路徑，其餘功能仍被 ACTIVE-only 解析自動封鎖"
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

# STATUS-RULE-035 — findExpiredByNaturalKey()／findClosedByNaturalKey()：僅 AMEND_EXPIRY_DATE／REOPEN 擁有專屬的非 ACTIVE 合約 natural-key 解析後備路徑，其餘功能仍被 ACTIVE-only 解析自動封鎖

## Status
CONFIRMED

## Business Rule
所有一般功能（A2/A3/A3S/A8/B3 等）以 naturalKey 尋找合約時，均透過 `findActiveByNaturalKey()`——只查詢 `status = 'ACTIVE'` 的列——這是 F1 提案 §7.8（BA 確認）刻意用來自動封鎖「EXPIRED 之後 A2/B2、A3/A3S、A8、B3 一律不得再動用」的機制：不需要每個功能各自額外檢查合約狀態，只要合約不再是 ACTIVE，這些功能的一般解析路徑就自然找不到它。`AMEND_EXPIRY_DATE`（作用於 EXPIRED 合約時，即 Expiry Extension Amendment）與 `REOPEN`（作用於 CLOSED 合約）是**僅有的兩個**例外——`resolveOrCreateContract()` 對這兩個 movementType 各自準備了專屬的、刻意限縮範圍的後備解析函式：`findExpiredByNaturalKey()`（`status = 'EXPIRED'`）僅供 `AMEND_EXPIRY_DATE` 使用、`findClosedByNaturalKey()`（`status = 'CLOSED'`）僅供 `REOPEN` 使用——兩者结构完全相同，僅 WHERE 子句中的狀態值不同，且文件註解明確標註「刻意窄，只有 Extension Amendment／REOPEN 自己的解析路徑該呼叫它」，不作為任何其他功能的通用後備。

## Conditions
Maker 以 naturalKey（而非已解析好的 `balanceContractId`）提交一筆 `movementType === 'AMEND_EXPIRY_DATE'` 或 `movementType === 'REOPEN'` 的請求，且 `findActiveByNaturalKey()` 找不到對應的 ACTIVE 合約

## Result
`AMEND_EXPIRY_DATE` 額外嘗試 `findExpiredByNaturalKey()`；`REOPEN` 額外嘗試 `findClosedByNaturalKey()`；其餘任何 movementType 一律不會嘗試任何非 ACTIVE 後備查詢，找不到 ACTIVE 合約即視為建立新合約（若為 creating movementType）或直接找不到（拋 `NotFoundError`）。

## Example
一筆 LC 已因 CLOSE 變成 `CLOSED`，Maker 以其 `lcNumber` 提交 A2 的 AMEND_INCREASE → `findActiveByNaturalKey()` 找不到（合約非 ACTIVE），且 A2/AMEND_INCREASE 不在例外名單中，功能被自然封鎖。同一個 `lcNumber` 提交 A11 REOPEN → `findActiveByNaturalKey()` 一樣找不到，但 REOPEN 額外呼叫 `findClosedByNaturalKey()`，成功找到這筆 CLOSED 合約並繼續處理。

## Verification Note
已直接阅读 `microservices/balance-component/src/store/balanceContractStore.ts` 的 `findExpiredByNaturalKey()`（第 199-214 行）與 `findClosedByNaturalKey()`（第 217-231 行），兩者文件註解互相對照、結構完全一致；已直接阅读 `service/balanceService.ts` 的 `resolveOrCreateContract()`（第 1316-1324 行）確認僅 `AMEND_EXPIRY_DATE`／`REOPEN` 兩個 `else if` 分支呼叫這兩個函式。已由 `test/unit/service/expiryExtensionAndReopen.test.ts:107-191`（含「AMEND_EXPIRY_DATE resolves an EXPIRED contract by naturalKey」「REOPEN resolves a CLOSED contract by naturalKey」「naturalKey resolution... never matches an ACTIVE contract under a DIFFERENT logical contract of the same LC number」三個子案例）直接核實。

## Source Evidence

实现:
- `microservices/balance-component/src/store/balanceContractStore.ts:199-214`
- `microservices/balance-component/src/store/balanceContractStore.ts:217-231`
- `microservices/balance-component/src/service/balanceService.ts:1316-1324`

测试:
- `microservices/balance-component/test/unit/service/expiryExtensionAndReopen.test.ts:107-191`

## Related Knowledge
- [[MOVEMENT-RULE-068]]
- [[MOVEMENT-RULE-064]]
- [[STATUS-RULE-013]]
- [[A11-LC-Reopen]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
